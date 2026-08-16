import fs from "node:fs";
import path from "node:path";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function validateWebSocketEndpoint(value) {
  const parsed = new URL(value);
  if (!['ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported DevTools WebSocket protocol: ${parsed.protocol}`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing non-loopback DevTools WebSocket endpoint: ${value}`);
  }
  if (!parsed.pathname.startsWith('/devtools/')) {
    throw new Error(`Unexpected DevTools WebSocket path: ${parsed.pathname}`);
  }
}

export class CdpConnection {
  constructor(webSocketUrl) {
    validateWebSocketEndpoint(webSocketUrl);
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async connect(timeout = 10_000) {
    if (this.socket) return;
    const socket = new WebSocket(this.webSocketUrl);
    this.socket = socket;
    await Promise.race([
      new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", () => reject(new Error(`WebSocket connection failed: ${this.webSocketUrl}`)), { once: true });
      }),
      delay(timeout).then(() => { throw new Error(`Timed out connecting to ${this.webSocketUrl}`); })
    ]);
    socket.addEventListener("message", (event) => this.#handle(event.data));
    socket.addEventListener("close", () => this.#failAll(new Error("CDP connection closed")));
    socket.addEventListener("error", () => this.#failAll(new Error("CDP connection failed")));
  }

  #handle(raw) {
    const message = JSON.parse(String(raw));
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }
    const listeners = this.listeners.get(message.method);
    if (!listeners) return;
    for (const listener of [...listeners]) listener(message.params || {});
  }

  #failAll(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  send(method, params = {}, timeout = 30_000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP is not connected for ${method}`));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  once(method, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const remove = this.on(method, (params) => {
        clearTimeout(timer);
        remove();
        resolve(params);
      });
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`CDP event timed out: ${method}`));
      }, timeout);
    });
  }

  async evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
    }
    return result.result?.value;
  }

  async waitForExpression(expression, { timeout = 30_000, polling = 100 } = {}) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(expression);
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await delay(polling);
    }
    throw new Error(`Expression did not become truthy: ${expression}${lastError ? ` (${lastError.message})` : ""}`);
  }

  async close() {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
    this.#failAll(new Error("CDP connection closed"));
  }
}

export function metricsToObject(payload) {
  return Object.fromEntries((payload?.metrics || []).map((entry) => [entry.name, entry.value]));
}

export function diffMetrics(before, after) {
  const output = {};
  for (const [name, value] of Object.entries(after || {})) {
    if (!Number.isFinite(value)) continue;
    const previous = before?.[name];
    output[name] = Number.isFinite(previous) ? Number((value - previous).toFixed(9)) : value;
  }
  return output;
}

export async function collectCdpSnapshot(session) {
  const [performance, domCounters] = await Promise.all([
    session.send("Performance.getMetrics"),
    session.send("Memory.getDOMCounters").catch(() => null)
  ]);
  return {
    performance: metricsToObject(performance),
    domCounters
  };
}

export async function startTrace(session, categories) {
  await session.send("Tracing.start", {
    categories,
    transferMode: "ReturnAsStream",
    traceConfig: {
      recordMode: "recordContinuously",
      includedCategories: categories.split(",").map((value) => value.trim()).filter(Boolean)
    }
  }).catch(async () => {
    // Older Chromium versions reject traceConfig together with categories.
    await session.send("Tracing.start", {
      categories,
      transferMode: "ReturnAsStream"
    });
  });
}

async function writeProtocolStream(session, handle, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const descriptor = fs.openSync(outputPath, "w");
  let bytes = 0;
  try {
    while (true) {
      const response = await session.send("IO.read", { handle });
      const chunk = response.base64Encoded
        ? Buffer.from(response.data || "", "base64")
        : Buffer.from(response.data || "", "utf8");
      if (chunk.length) {
        fs.writeSync(descriptor, chunk);
        bytes += chunk.length;
      }
      if (response.eof) break;
    }
  } finally {
    fs.closeSync(descriptor);
    await session.send("IO.close", { handle }).catch(() => {});
  }
  return bytes;
}

export async function stopTrace(session, outputPath) {
  const completed = session.once("Tracing.tracingComplete", 60_000);
  await session.send("Tracing.end");
  const event = await completed;
  if (!event?.stream) throw new Error("Chromium tracing completed without a stream handle");
  const bytes = await writeProtocolStream(session, event.stream, outputPath);
  return {
    path: outputPath,
    bytes,
    format: "chromium-trace-json"
  };
}

export const DEFAULT_TRACE_CATEGORIES = [
  "blink",
  "blink.user_timing",
  "cc",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-v8.gc",
  "gpu",
  "input",
  "latencyInfo",
  "loading",
  "renderer.scheduler",
  "toplevel",
  "v8",
  "viz"
].join(",");
