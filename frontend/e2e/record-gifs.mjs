// Turns the browser flow into the README GIFs in docs/gifs. Needs the site and API running, and ffmpeg.
//
//   FACE_DIR=<dir with p1.y4m p2.y4m p3.y4m room.y4m> BASE_URL=http://localhost:3000 node e2e/record-gifs.mjs
//
// Pass names to record only some: teacher-session, student-enrol, landing. Landing doesn't need FACE_DIR.
// RECORD_TMP=<dir> chooses where the temporary videos go (default: the system temp directory).
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(FRONTEND, "..", "docs", "gifs");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MAX_BYTES = 6 * 1024 * 1024;
const DESKTOP_WIDTH = 800;
const PHONE_WIDTH = 300;
const LANDING = { width: 1280, height: 800 };

// Each GIF is the part of one person's video between two lines the flow prints.
const FLOW_GIFS = {
  "teacher-session": { person: "Teacher", width: DESKTOP_WIDTH, from: "teacher can edit a student", to: "session ended with", after: 2.5 },
  "student-enrol": { person: "Asha", width: PHONE_WIDTH, from: "profile saves and persists", to: "test recognition knows Asha", after: 2 },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(FLOW_GIFS), "landing"];
const tmp = mkdtempSync(path.join(process.env.RECORD_TMP ?? tmpdir(), "rollcall-gifs-"));
mkdirSync(OUT, { recursive: true });

const duration = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));

/** Two-pass palette keeps the sage backgrounds clean. Steps down in quality until the file fits. */
function toGif(video, name, width, start, length) {
  const file = path.join(OUT, `${name}.gif`);
  for (const [fps, colors] of [[12, 128], [12, 96], [10, 96], [10, 64], [8, 64]]) {
    const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", start.toFixed(2), "-t", length.toFixed(2), "-i", video, "-vf", filter, file]);
    const { size } = statSync(file);
    console.log(`${name}.gif: ${length.toFixed(1)}s, ${fps} fps, ${colors} colours, ${(size / 1024 / 1024).toFixed(1)} MB`);
    if (size <= MAX_BYTES) return;
  }
  throw new Error(`${name}.gif is still over 6 MB. Tighten its span.`);
}

/** Runs the flow with video on, returning the wall-clock time of each line it prints. */
function runFlow(videoDir) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const flow = spawn(process.execPath, ["e2e/flow.mjs"], { cwd: FRONTEND, env: { ...process.env, VIDEO: videoDir }, stdio: ["ignore", "pipe", "inherit"] });
    let partial = "";
    flow.stdout.on("data", (chunk) => {
      const parts = (partial + chunk).split("\n");
      partial = parts.pop();
      for (const text of parts) {
        console.log(text);
        lines.push({ text, at: Date.now() });
      }
    });
    flow.on("exit", (code) => (code === 0 ? resolve(lines) : reject(new Error(`The flow failed with exit code ${code}.`))));
  });
}

async function recordFlowGifs() {
  if (!process.env.FACE_DIR) throw new Error("FACE_DIR is required to record the flow.");
  const videoDir = path.join(tmp, "flow");
  const lines = await runFlow(videoDir);
  const timeOf = (text) => lines.find((line) => line.text.includes(text))?.at;
  for (const [name, gif] of Object.entries(FLOW_GIFS)) {
    if (!wanted.includes(name)) continue;
    const dir = path.join(videoDir, gif.person);
    const video = path.join(dir, readdirSync(dir).find((file) => file.endsWith(".webm")));
    // The video stops when its browser closes, which is when the file was last written.
    const videoStart = statSync(video).mtimeMs - duration(video) * 1000;
    const start = (timeOf(gif.from) - videoStart) / 1000;
    const end = (timeOf(gif.to) - videoStart) / 1000 + gif.after;
    toGif(video, name, gif.width, start, Math.min(end, duration(video)) - start);
  }
}

async function recordLanding() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: LANDING, recordVideo: { dir: path.join(tmp, "landing"), size: LANDING } });
  const page = await context.newPage();
  const opened = Date.now();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const start = (Date.now() - opened) / 1000;
  await page.waitForTimeout(1200);
  await page.evaluate(
    (ms) =>
      new Promise((done) => {
        const target = document.documentElement.scrollHeight - innerHeight;
        const t0 = performance.now();
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / ms);
          scrollTo(0, target * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2));
          if (k < 1) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      }),
    7000,
  );
  await page.waitForTimeout(1200);
  const video = await page.video().path();
  await context.close();
  await browser.close();
  toGif(video, "landing", DESKTOP_WIDTH, start, duration(video) - start);
}

try {
  if (Object.keys(FLOW_GIFS).some((name) => wanted.includes(name))) await recordFlowGifs();
  if (wanted.includes("landing")) await recordLanding();
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
