#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repoRoot, "benchmarks", "fixtures", "conversation");
const extensionRoot = path.join(repoRoot, "product", "extension");

function parseArgs(argv) {
  const options = { executable: process.env.CHROME || process.env.CHROMIUM || "chromium", turns: 200, timeout: 30_000, headless: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--headless") options.headless = true;
    else if (arg.startsWith("--")) options[arg.slice(2)] = argv[++index];
  }
  options.turns = Number(options.turns);
  options.timeout = Number(options.timeout);
  return options;
}

function serve(root) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const base = path.resolve(root);
    const file = path.resolve(base, relative);
    const relation = path.relative(base, file);
    if (relation.startsWith("..") || path.isAbsolute(relation)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      const contentType = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css";
      response.writeHead(200, { "content-type": `${contentType}; charset=utf-8`, "cache-control": "no-store" });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}


async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForFile(file, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${file}`);
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  command(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function findPage(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page" && target.url.startsWith("http://127.0.0.1"));
      if (page) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for benchmark target");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { server, port } = await serve(fixtureRoot);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "longview-smoke-"));
  const logPath = path.join(profile, "chromium.log");
  const log = fs.openSync(logPath, "w");
  const url = `http://127.0.0.1:${port}/?turns=${options.turns}&code=1&tables=1&images=1`;
  const debugPort = await reservePort();
  const args = [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--disable-extensions-except=${extensionRoot}`,
    `--load-extension=${extensionRoot}`,
    "--window-size=1440,900"
  ];
  if (typeof process.getuid === "function" && process.getuid() === 0) args.push("--no-sandbox");
  if (options.headless) args.push("--headless=new");
  args.push(url);

  const browser = spawn(options.executable, args, { stdio: ["ignore", log, log] });
  let session;
  try {
    const page = await findPage(debugPort, options.timeout);
    session = new CdpSession(page.webSocketDebuggerUrl);
    await session.open();
    await session.command("Runtime.enable");
    const expression = `new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        const nodes = [...document.querySelectorAll('[data-longview-segment="true"]')];
        if (nodes.length > 0 || performance.now() - started > 20000) {
          const states = nodes.reduce((out, node) => { const state = node.dataset.longviewState || 'unknown'; out[state] = (out[state] || 0) + 1; return out; }, {});
          resolve({ nodes: nodes.length, states, domNodes: document.getElementsByTagName('*').length, pageScreens: document.documentElement.scrollHeight / innerHeight, title: document.title });
        } else setTimeout(check, 200);
      };
      check();
    })`;
    const response = await session.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    const result = response.result?.value;
    if (!result || result.nodes < Math.min(12, options.turns)) {
      throw new Error(`LongView did not activate: ${JSON.stringify(result)}\nChromium log: ${logPath}`);
    }
    if (!result.states.cold || !result.states.hot) {
      throw new Error(`Expected both hot and cold segments: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    session?.close();
    if (browser.exitCode === null) {
      browser.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => browser.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 1000))
      ]);
      if (browser.exitCode === null) browser.kill("SIGKILL");
    }
    await new Promise((resolve) => server.close(resolve));
    fs.closeSync(log);
    if (process.env.KEEP_LONGVIEW_SMOKE_PROFILE !== "1") fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
