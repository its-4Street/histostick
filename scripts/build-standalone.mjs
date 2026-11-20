#!/usr/bin/env node
// Builds standalone.html: the whole demonstration page in ONE file that opens straight from disk.
// No server, no Node and no packages are needed to view it; double-click the file. (Node is only needed to rebuild it.)
//
//   node scripts/build-standalone.mjs
//
// It is index.html with everything it would have loaded written into it: both stylesheets, the chart and page
// code, the data sets (as inert JSON blocks) and the two images (as data: addresses). Nothing is minified or
// rewritten beyond dropping the import / export words, so the file can be read and compared with src/.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

// in dependency order; page.js last
const MODULES = ["src/histostick.js", "src/sec-data.js", "src/sec-columns.js", "src/dummy-columns.js", "src/nvda-columns.js", "src/nhanes-columns.js", "src/page.js"];
const STYLES = ["src/histostick.css", "src/style.css"];
const DATA = ["data/dummy-home-prices.json", "data/nvda-moves.json", "data/nhanes-blood-pressure.json"];

/** One module's code with its import lines removed and the word "export" dropped, ready to share one script. */
function inlined(file) {
  const code = read(file)
    .replace(/^import [^;]*;\s*$/gm, "")
    .replace(/^export (?=(async )?(const|let|function|class) )/gm, "");
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`${file}: an import or export this build does not understand`);
  return `// ---- ${file}\n${code.trim()}\n`;
}

const swap = (page, from, to) => {
  if (!page.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  return page.replaceAll(from, () => to);
};

/** The text of standalone.html, worked out from the files as they are now. */
export function buildStandalone() {
  const dataUri = (file, type) => `data:${type};base64,${readFileSync(resolve(root, file)).toString("base64")}`;
  const closing = (text, tag) => text.replaceAll(`</${tag}`, `<\\/${tag}`);   // nothing inside may end its own block early

  const styles = STYLES.map((f) => `/* ---- ${f} */\n${read(f).trim()}\n`).join("\n");
  const blocks = DATA.map((f) => `    <script type="application/json" id="${f}">${closing(JSON.stringify(JSON.parse(read(f))), "script")}</script>`).join("\n");
  const code = closing(MODULES.map(inlined).join("\n"), "script");

  let page = read("index.html");
  page = swap(page, "<!doctype html>", "<!doctype html>\n<!-- BUILT by scripts/build-standalone.mjs from index.html, src/, data/ and assets/. Opens straight from disk: no server, no Node. Do not edit by hand. -->");
  page = swap(page, '    <link rel="stylesheet" href="src/histostick.css" />\n', "");
  page = swap(page, '    <link rel="stylesheet" href="src/style.css" />', `    <style>\n${closing(styles, "style")}    </style>`);
  page = swap(page, 'href="assets/favicon.svg"', `href="${dataUri("assets/favicon.svg", "image/svg+xml")}"`);
  page = swap(page, 'src="assets/4street-logo.png"', `src="${dataUri("assets/4street-logo.png", "image/png")}"`);
  page = swap(page, '    <script type="module" src="src/page.js"></script>', `${blocks}\n    <script type="module">\n${code}    </script>`);
  return page;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const page = buildStandalone();
  writeFileSync(resolve(root, "standalone.html"), page);
  console.log(`standalone.html written, ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB. Open it directly in a browser.`);
}
