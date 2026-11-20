#!/usr/bin/env node
// Copies codemeta.json into the structured data block of index.html, so the two never disagree.
//   node scripts/sync-meta.mjs
// The page's copy uses the schema.org context, which is what search engines and most agents read.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const meta = JSON.parse(readFileSync(resolve(root, "codemeta.json"), "utf8"));
meta["@context"] = "https://schema.org";
const block = JSON.stringify(meta, null, 2).replaceAll("</", "<\\/");   // nothing in the data may close the script tag

const file = resolve(root, "index.html"), page = readFileSync(file, "utf8");
const open = '<script type="application/ld+json" id="about-data">', close = "</script>";
const start = page.indexOf(open), end = page.indexOf(close, start);
if (start < 0 || end < 0) throw new Error("index.html has no structured data block to fill");
writeFileSync(file, page.slice(0, start + open.length) + "\n" + block + "\n    " + page.slice(end));
console.log("index.html structured data now matches codemeta.json");
