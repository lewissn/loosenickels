/**
 * Screenshot tool.
 *
 * Chrome's `--screenshot` flag cannot render narrower than 500px on
 * Windows: it clamps the window and then crops the image to whatever
 * `--window-size` asked for, so a request for 390 returns a 500px layout
 * with 110px sliced off the side. Every "mobile" capture taken that way is
 * a lie, and a convincing one — the page looks like it has overflow bugs.
 *
 * So this drives Chrome over the DevTools protocol instead, where
 * `Emulation.setDeviceMetricsOverride` sets a real layout viewport at any
 * width, and `captureBeyondViewport` gets the whole page rather than the
 * fold.
 *
 * No dependencies: Node 22+ has a built-in WebSocket client.
 *
 *   node tools/shot.mjs <outDir> <baseUrl> <width> <height> <name=path> ...
 *   node tools/shot.mjs ./shots http://localhost:3000 390 844 home=/ about=/about
 *
 * Pass height 0 for a full-page capture.
 *
 * From Git Bash on Windows, prefix the command with MSYS_NO_PATHCONV=1.
 * MSYS rewrites any argument that looks like a POSIX path, so `home=/`
 * arrives as `home=C:/Program Files/Git/` and Chrome rejects the URL with
 * the unhelpful "Cannot navigate to invalid URL". PowerShell and cmd are
 * unaffected.
 */

import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const PORT = 9222 + Math.floor(Math.random() * 400);

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error("No Chrome or Edge found.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevTools(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error("Chrome DevTools endpoint never became available.");
}

/** Minimal CDP client over the built-in WebSocket. */
function connect(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const events = new Map();

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", (e) => reject(new Error(String(e.message ?? e.type))));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method) {
      const waiters = events.get(message.method) ?? [];
      events.set(message.method, []);
      for (const w of waiters) w(message.params);
    }
  });

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method, timeoutMs = 15000) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        const waiters = events.get(method) ?? [];
        waiters.push((params) => {
          clearTimeout(timer);
          resolve(params);
        });
        events.set(method, waiters);
      });
    },
    close: () => socket.close(),
  };
}

async function main() {
  const [outDir, baseUrl, widthArg, heightArg, ...pages] = process.argv.slice(2);
  if (!outDir || !baseUrl || pages.length === 0) {
    console.error("usage: node tools/shot.mjs <outDir> <baseUrl> <w> <h> name=/path ...");
    process.exit(1);
  }

  const width = Number(widthArg) || 1440;
  const height = Number(heightArg) || 900;
  const fullPage = height === 0;
  const mobile = width < 700;

  await mkdir(outDir, { recursive: true });

  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${PORT}`,
      /* Comfortably above Chrome's 500px floor; the real viewport is set
         per-capture through device metrics, which has no such limit. */
      "--window-size=1600,1200",
      `--user-data-dir=${path.join(process.env.TEMP ?? "/tmp", `ln-shot-${PORT}`)}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitForDevTools();

    for (const spec of pages) {
      const at = spec.indexOf("=");
      const name = spec.slice(0, at);
      const route = spec.slice(at + 1);

      const created = await fetch(
        `http://127.0.0.1:${PORT}/json/new?about:blank`,
        { method: "PUT" },
      ).then((r) => r.json());

      const client = connect(created.webSocketDebuggerUrl);
      await client.ready;

      await client.send("Page.enable");
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: fullPage ? 1200 : height,
        deviceScaleFactor: 2,
        mobile,
      });

      const loaded = client.once("Page.loadEventFired");
      await client.send("Page.navigate", { url: baseUrl + route });
      await loaded;

      /* Fonts are a real network fetch and the load event does not wait
         for them. Ask the page directly rather than guessing at a delay. */
      await client.send("Runtime.evaluate", {
        expression: "document.fonts.ready.then(() => true)",
        awaitPromise: true,
      });

      /* Then wait for entrance animations to finish.

         Anything that reveals from zero opacity is invisible until its
         animation has run, so capturing on fonts.ready alone photographs the
         page mid-entrance and reports a blank composition as the truth. Ask
         the page which animations are outstanding rather than sleeping a
         guessed interval; the race is capped so a looping animation cannot
         hang the capture. */
      await client.send("Runtime.evaluate", {
        expression: `Promise.race([
          Promise.allSettled(document.getAnimations().map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 3000)),
        ]).then(() => true)`,
        awaitPromise: true,
      });
      await sleep(250);

      const shot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: fullPage,
        /* deviceScaleFactor already renders at 2x; a clip scale on top
           of it would square the resolution for no extra detail. */
        ...(fullPage ? {} : { clip: { x: 0, y: 0, width, height, scale: 1 } }),
      });

      await writeFile(path.join(outDir, `${name}.png`), Buffer.from(shot.data, "base64"));
      const real = await client.send("Runtime.evaluate", {
        expression: "innerWidth",
        returnByValue: true,
      });
      console.log(`  ${name.padEnd(18)} ${real.result.value}px  ${route}`);
      client.close();
      await fetch(`http://127.0.0.1:${PORT}/json/close/${created.id}`);
    }
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
