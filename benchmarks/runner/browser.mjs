import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { CdpConnection } from "./cdp.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function endpoint(host, port, pathname) {
  return `http://${host}:${port}${pathname}`;
}

export function isLoopbackUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function parseWebSocketDebuggerUrl(text, host = "127.0.0.1") {
  const [portLine, browserPath] = String(text || "").trim().split(/\r?\n/);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid DevToolsActivePort value: ${portLine}`);
  }
  if (!browserPath?.startsWith("/devtools/browser/")) {
    throw new Error(`Invalid browser debugger path: ${browserPath}`);
  }
  return `ws://${host}:${port}${browserPath}`;
}

async function readJson(url, timeout = 5000) {
  if (!isLoopbackUrl(url)) throw new Error(`Refusing non-loopback DevTools HTTP endpoint: ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return response.json();
}

async function waitForBrowserEndpoint(host, port, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await readJson(endpoint(host, port, "/json/version"), 1500);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`Chromium DevTools endpoint did not start: ${lastError?.message || "timeout"}`);
}

async function waitForActivePort(userDataDir, host, timeout = 20_000) {
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const text = fs.readFileSync(portFile, "utf8");
      const browserWebSocketUrl = parseWebSocketDebuggerUrl(text, host);
      const port = Number(new URL(browserWebSocketUrl).port);
      return { port, browserWebSocketUrl };
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`Chromium DevToolsActivePort did not appear: ${lastError?.message || "timeout"}`);
}

export function selectPageTarget(targets, expectedUrl = null) {
  const pages = targets.filter((target) => target.type === "page" &&
    !target.url.startsWith("devtools://") && !target.url.startsWith("chrome-extension://"));
  if (expectedUrl) {
    const exact = pages.find((target) => target.url.startsWith(expectedUrl));
    if (exact) return exact;
  }
  return pages.find((target) => target.url !== "about:blank") || pages[0] || null;
}

async function waitForPage(host, port, expectedUrl = null, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const targets = await readJson(endpoint(host, port, "/json/list"));
    const target = selectPageTarget(targets, expectedUrl);
    if (target?.webSocketDebuggerUrl) return target;
    await delay(100);
  }
  throw new Error(`No debuggable page appeared${expectedUrl ? ` for ${expectedUrl}` : ""}`);
}

function terminate(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    killer.unref();
  } else if (!child.killed) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 2000).unref();
  }
}

export async function waitForChildExit(child, timeout = 5000) {
  if (!child || child.exitCode !== null) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(child.exitCode !== null), timeout);
    child.once("exit", onExit);
  });
}

export async function launchChromium({
  executable,
  userDataDir,
  extensionPath = null,
  headless = false,
  browserArgs = []
}) {
  const host = "127.0.0.1";
  const args = [
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-component-update",
    "--disable-features=TranslateUI",
    "--password-store=basic",
    "--window-size=1440,1000",
    ...browserArgs
  ];
  if (headless) args.push("--headless=new", "--hide-scrollbars", "--disable-gpu");
  if (extensionPath) {
    args.push(`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`);
  }
  // Start from a normal page so Linux doesn't take the unsupported no-startup-window path.
  args.push("about:blank");

  const child = spawn(executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
  });
  child.once("error", () => {});

  let port;
  let browserWebSocketUrl;
  let version;
  try {
    const active = await waitForActivePort(userDataDir, host);
    port = active.port;
    browserWebSocketUrl = active.browserWebSocketUrl;
    version = await waitForBrowserEndpoint(host, port);
    if (version.webSocketDebuggerUrl) browserWebSocketUrl = version.webSocketDebuggerUrl;
  } catch (error) {
    terminate(child);
    await waitForChildExit(child, 5000);
    throw new Error(`${error.message}\nChromium stderr:\n${stderr}`);
  }

  const browserClient = new CdpConnection(browserWebSocketUrl);
  await browserClient.connect();

  async function attach(target) {
    const pageClient = new CdpConnection(target.webSocketDebuggerUrl);
    await pageClient.connect();
    await pageClient.send("Page.enable");
    await pageClient.send("Runtime.enable");
    await pageClient.send("Performance.enable");
    await pageClient.send("Network.enable");
    return pageClient;
  }

  let pageTarget = await waitForPage(host, port, "about:blank");
  let pageClient = await attach(pageTarget);

  async function navigate(url, timeout = 30_000) {
    const loaded = pageClient.once("Page.loadEventFired", timeout).catch(() => null);
    const response = await pageClient.send("Page.navigate", { url });
    if (response.errorText) throw new Error(`Navigation failed: ${response.errorText}`);
    await loaded;
    await pageClient.waitForExpression("document.readyState === 'complete'", { timeout });
    return response;
  }

  async function setDocumentContent(html, timeout = 30_000) {
    const tree = await pageClient.send("Page.getFrameTree");
    const frameId = tree?.frameTree?.frame?.id;
    if (!frameId) throw new Error("Could not resolve the root frame for inline fixture content");
    await pageClient.send("Page.setDocumentContent", { frameId, html });
    await pageClient.waitForExpression("document.readyState === 'complete'", { timeout });
  }

  async function switchToExpectedPage(expectedUrl, timeout = 30_000) {
    const target = await waitForPage(host, port, expectedUrl, timeout);
    if (target.id !== pageTarget.id) {
      await pageClient.close();
      pageTarget = target;
      pageClient = await attach(target);
    }
    return pageTarget;
  }

  async function close() {
    await pageClient.close().catch(() => {});
    await browserClient.send("Browser.close").catch(() => {});
    await browserClient.close().catch(() => {});
    if (!(await waitForChildExit(child, 5000))) {
      terminate(child);
      await waitForChildExit(child, 5000);
    }
  }

  return {
    child,
    port,
    version,
    browserClient,
    get client() { return pageClient; },
    navigate,
    setDocumentContent,
    switchToExpectedPage,
    close
  };
}
