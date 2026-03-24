import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { WebSocketServer } from "ws";
import pty from "@lydell/node-pty";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const SHELL = process.env.SHELL || "/bin/bash";

// MIME types for static files
const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// Resolve ghostty-web dist path for serving WASM + JS
const ghosttyPath = join(
  __dirname,
  "node_modules",
  "ghostty-web",
  "dist"
);

// HTTP server: serves index.html and static assets
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(readFileSync(join(__dirname, "public", "index.html")));
    return;
  }

  // Serve from public/ first, then ghostty-web dist/
  const publicPath = join(__dirname, "public", url.pathname);
  const distPath = join(ghosttyPath, url.pathname);

  for (const filePath of [publicPath, distPath]) {
    try {
      const data = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
      return;
    } catch {
      continue;
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

// WebSocket server: spawns PTY per connection
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cols = parseInt(url.searchParams.get("cols") || "80", 10);
  const rows = parseInt(url.searchParams.get("rows") || "24", 10);

  const proc = pty.spawn(SHELL, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.env.HOME || "/home/ndtn",
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  proc.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  proc.onExit(() => ws.close());

  ws.on("message", (msg) => {
    const str = msg.toString();
    // Resize messages are JSON
    if (str.startsWith("{")) {
      try {
        const { type, cols, rows } = JSON.parse(str);
        if (type === "resize") proc.resize(cols, rows);
        return;
      } catch {
        // Not JSON, pass through as input
      }
    }
    proc.write(str);
  });

  ws.on("close", () => proc.kill());
});

server.listen(PORT, HOST, () => {
  console.log(`gttyd listening on http://${HOST}:${PORT}`);
});
