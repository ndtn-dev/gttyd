import { init, Terminal, FitAddon } from "/ghostty-web.js";

const MONO_FONT_FAMILY = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';

// Catppuccin Mocha theme
const THEME = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  cursorAccent: "#11111b",
  selectionBackground: "#585b70",
  selectionForeground: "#cdd6f4",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
};

// Escape sequences for toolbar keys
const KEYS = {
  esc: "\x1b",
  tab: "\t",
  up: "\x1b[A",
  down: "\x1b[B",
  left: "\x1b[D",
  right: "\x1b[C",
};

let ws = null;
let term = null;
let ctrlActive = false;
let lastTouchButton = null;
let lastTouchTime = 0;
let fitScheduled = false;

async function fitWhenReady(fitAddon) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.load('16px "JetBrains Mono"');
      await document.fonts.ready;
    } catch {}
  }

  await new Promise((resolve) => requestAnimationFrame(resolve));
  fitAddon.fit();
  requestAnimationFrame(() => fitAddon.fit());
}

function scheduleFit(fitAddon) {
  if (fitScheduled) return;
  fitScheduled = true;

  requestAnimationFrame(async () => {
    fitScheduled = false;
    await fitWhenReady(fitAddon);
  });
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

function handleToolbarButton(btn) {
  const key = btn.dataset.key;

  // CTL toggle
  if (key === "ctl") {
    ctrlActive = !ctrlActive;
    btn.classList.toggle("active", ctrlActive);
    return;
  }

  let data = KEYS[key];
  if (!data) return;

  // CTL modifier: convert to control character
  if (ctrlActive && data.length === 1) {
    data = String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64);
    ctrlActive = false;
    document.getElementById("btn-ctl").classList.remove("active");
  }

  send(data);
  term.focus();
}

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws?cols=${term.cols}&rows=${term.rows}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    term.focus();
  };

  ws.onmessage = (e) => {
    term.write(e.data);
  };

  ws.onclose = () => {
    term.write("\r\n\x1b[31mDisconnected. Reconnecting...\x1b[0m\r\n");
    setTimeout(connect, 2000);
  };
}

async function main() {
  await init();

  term = new Terminal({
    fontSize: 16,
    fontFamily: MONO_FONT_FAMILY,
    theme: THEME,
    scrollback: 50000,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById("terminal-container"));
  await fitWhenReady(fitAddon);

  // Show/hide toolbar and reposition when virtual keyboard opens/closes
  const container = document.getElementById("terminal-container");
  const toolbar = document.getElementById("toolbar");
  const KB_THRESHOLD = 100; // pixels — below this, keyboard is considered closed

  function onViewportResize() {
    const kbHeight = window.innerHeight - window.visualViewport.height;
    const kbOpen = kbHeight > KB_THRESHOLD;

    toolbar.classList.toggle("visible", kbOpen);

    if (kbOpen) {
      toolbar.style.bottom = kbHeight + "px";
      container.style.bottom = (44 + kbHeight) + "px";
    } else {
      toolbar.style.bottom = "0";
      container.style.bottom = "0";
    }

    scheduleFit(fitAddon);
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onViewportResize);
    window.visualViewport.addEventListener("scroll", onViewportResize);
  }
  window.addEventListener("resize", () => scheduleFit(fitAddon));

  // Send terminal input to PTY
  term.onData((data) => send(data));

  // Send resize events to server
  term.onResize(({ cols, rows }) => {
    send(JSON.stringify({ type: "resize", cols, rows }));
  });

  connect();
  setupToolbar();
}

function setupToolbar() {
  const toolbar = document.getElementById("toolbar");
  const ctlBtn = document.getElementById("btn-ctl");

  // Prevent focus theft
  toolbar.addEventListener("touchstart", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    e.preventDefault();
  }, { passive: false });

  toolbar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });

  toolbar.addEventListener("touchend", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    e.preventDefault();
    const touchTime = Date.now();
    lastTouchButton = btn;
    lastTouchTime = touchTime;
    setTimeout(() => {
      if (lastTouchTime === touchTime) {
        lastTouchButton = null;
      }
    }, 800);
    handleToolbarButton(btn);
  });

  toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn === lastTouchButton && Date.now() - lastTouchTime < 700) {
      e.preventDefault();
      lastTouchButton = null;
      return;
    }

    lastTouchButton = null;
    handleToolbarButton(btn);
  });

  // CTL + virtual keyboard key
  document.addEventListener("keydown", (e) => {
    if (!ctrlActive || e.key.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    send(String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64));
    ctrlActive = false;
    ctlBtn.classList.remove("active");
  }, true);
}

main();
