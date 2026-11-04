// Builds docs/Rollcall-Project-Report.pdf from docs/report/report.html, and exports the report's
// diagrams to docs/diagrams/*.png for the README. Works from any directory:
//
//   PLAYWRIGHT_BROWSERS_PATH=<dir> node docs/report/build.mjs
//
// Needs frontend/node_modules (npm install in frontend), pdftotext from poppler, and network access
// for Public Sans. Screenshots are read from docs/screenshots at build time, so retaking them and
// running this again is all an update takes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(HERE, "..");
const OUT = path.join(DOCS, "Rollcall-Project-Report.pdf");
const { chromium } = createRequire(path.join(DOCS, "../frontend/package.json"))("playwright");

const inlineImages = (html) =>
  html.replace(/src="([^"]+\.png)"/g, (_, src) => {
    const data = readFileSync(path.join(HERE, src)).toString("base64");
    return `src="data:image/png;base64,${data}"`;
  });

const squash = (text) => text.replace(/\s+/g, " ").trim();

/** Lines of text on each page of a PDF, whitespace-normalised. */
function pdfPages(file) {
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  return text.split("\f").slice(0, -1).map((page) => page.split("\n").map(squash));
}

/** Page number of each heading, searching forward so a heading can't match an earlier page. */
function locate(headings, pages, firstBodyPage) {
  let at = firstBodyPage;
  return headings.map((heading) => {
    while (at < pages.length && !pages[at].includes(heading)) at++;
    if (at === pages.length) throw new Error(`Heading not found in the PDF: "${heading}"`);
    return at + 1;
  });
}

const fillContents = (page, numbers) =>
  page.evaluate((numbers) => {
    const headings = [...document.querySelectorAll("[data-toc]")];
    document.querySelector("#toc").innerHTML = headings
      .map((h, i) => {
        const [number, ...title] = h.textContent.trim().split(/\s+/);
        const label = h.dataset.toc === "appendix" ? `<span></span><span>${h.textContent.trim()}</span>` : `<span>${number}</span><span>${title.join(" ")}</span>`;
        return `<li class="toc-${h.tagName.toLowerCase()}">${label}<span>${numbers[i]}</span></li>`;
      })
      .join("");
  }, numbers);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });
  await page.setContent(inlineImages(readFileSync(path.join(HERE, "report.html"), "utf8")), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const fontsLoaded = await page.evaluate(() => document.fonts.check('300 12px "Public Sans"') && document.fonts.check('600 12px "Public Sans"'));
  if (!fontsLoaded) throw new Error("Public Sans did not load. The build needs network access to Google Fonts.");

  const headings = await page.evaluate(() => [...document.querySelectorAll("[data-toc]")].map((h) => h.textContent.replace(/\s+/g, " ").trim()));
  const render = () => page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });

  // Two passes: render with placeholder numbers, read where headings landed, then render for real.
  // The contents page takes the same space either way, so filling in the numbers can't move anything.
  await fillContents(page, headings.map(() => "00"));
  await render();
  const numbers = locate(headings, pdfPages(OUT), 2);
  await fillContents(page, numbers);
  await render();

  const pages = pdfPages(OUT);
  const final = locate(headings, pages, 2);
  if (final.join() !== numbers.join()) throw new Error(`Contents page moved between passes: ${numbers} vs ${final}`);

  const diagrams = await page.locator("svg[data-export]").all();
  mkdirSync(path.join(DOCS, "diagrams"), { recursive: true });
  for (const svg of diagrams) {
    const name = await svg.getAttribute("data-export");
    await svg.screenshot({ path: path.join(DOCS, "diagrams", `${name}.png`) });
  }
  console.log(`${path.relative(process.cwd(), OUT)}: ${pages.length} pages, ${headings.length} contents entries, ${diagrams.length} diagrams exported`);
} finally {
  await browser.close();
}
