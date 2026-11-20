#!/usr/bin/env node
// Checks the data, the chart's numbers, the served page, and that the project is self-contained.
// Node built-ins only.
//   node scripts/verify.mjs
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChart, arrange, bandIndex, yearsOf, withinYears, MONEY_BANDS } from "../src/histostick.js";
import { secColumns, OFFICE } from "../src/sec-columns.js";
import * as secData from "../src/sec-data.js";
import { dummyColumns, CHANGE_BANDS, percent } from "../src/dummy-columns.js";
import { nvdaColumns, MOVE_BANDS, RULES, FLAGS } from "../src/nvda-columns.js";
import { nhanesColumns, PRESSURE_BANDS, mmHg } from "../src/nhanes-columns.js";
import { SETS } from "./make-dummy.mjs";
import { start } from "./serve.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const { SEC_ROWS, SEC_SAMPLE } = secData;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

// ---------------------------------------------------------------- the data

ok("SEC sample is the declared sample, rows well formed, no names", () => {
  assert.equal(SEC_ROWS.length, SEC_SAMPLE.rows);
  assert.ok(Math.abs(SEC_ROWS.length - SEC_SAMPLE.ofMoneyRows / SEC_SAMPLE.every) <= 1);
  for (const r of SEC_ROWS) {
    assert.equal(r.length, 3);
    assert.ok(r[0] > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r[1]) && r[2].length > 0 && r[2].every((o) => OFFICE[o]));
  }
});

ok("SEC sample module holds the rows, three counts and a date, and nothing else", () => {
  assert.deepEqual(Object.keys(secData).sort(), ["SEC_ROWS", "SEC_SAMPLE"]);
  assert.deepEqual(Object.keys(SEC_SAMPLE).sort(), ["asOf", "every", "ofMoneyRows", "rows"]);
  const dataLines = read("src/sec-data.js").split("\n").filter((l) => l.startsWith("  ["));
  assert.equal(dataLines.length, SEC_ROWS.length);
  assert.ok(dataLines.every((l) => /^  \[[\d.]+,"\d{4}-\d{2}-\d{2}",\["[a-z-]+"(,"[a-z-]+")*\]\],$/.test(l)));
});

const { byOffice, byYear } = secColumns(SEC_ROWS);
ok("SEC: year columns hold every row once, oldest first; office columns busiest first", () => {
  assert.equal(byYear.reduce((a, c) => a + c.values.length, 0), SEC_ROWS.length);
  assert.equal(byOffice.reduce((a, c) => a + c.values.length, 0), SEC_ROWS.reduce((a, r) => a + r[2].length, 0));
  assert.deepEqual(byYear.map((c) => c.key), byYear.map((c) => c.key).sort());
  byOffice.forEach((c, i) => i && assert.ok(byOffice[i - 1].values.length >= c.values.length));
});

const made = Object.fromEntries(Object.keys(SETS).map((f) => [f, JSON.parse(read(`data/${f}`))]));
const byCity = dummyColumns(made["dummy-home-prices.json"]);
ok("the made-up set is flagged fictional and is exactly what the seeded generator makes", () => {
  for (const [file, set] of Object.entries(made)) {
    assert.equal(set.fictional, true, file);
    assert.deepEqual(set, JSON.parse(JSON.stringify(SETS[file](set.seed))), file);
    const cols = dummyColumns(set);
    assert.equal(cols.reduce((a, c) => a + c.values.length, 0), set.rows.length);
    assert.ok(cols.every((c) => c.group && c.values.length && c.values.every((x) => bandIndex(CHANGE_BANDS, x.v) >= 0)), file);
  }
});

const nvda = JSON.parse(read("data/nvda-moves.json"));
const byDay = nvdaColumns(nvda), col = (k) => byDay.find((c) => c.key === k);
ok("NVDA file holds moves only: a date, a move, a volume ratio and flags per session, no prices", () => {
  assert.deepEqual(Object.keys(nvda).sort(), ["columns", "flags", "note", "rows", "schema", "source", "symbol"]);
  assert.deepEqual(nvda.columns, ["date", "move_percent", "volume_ratio", "flags"]);
  const days = nvda.rows.map((r) => r[0]), all = Object.values(FLAGS).reduce((a, b) => a | b, 0);
  assert.deepEqual(days, [...new Set(days)].sort());
  for (const [date, move, ratio, flags] of nvda.rows) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(date) && Math.abs(move) < 40 && (ratio === null || (ratio > 0 && ratio < 20)));
    assert.ok(Number.isInteger(flags) && (flags & ~all) === 0);
  }
  assert.ok(nvda.rows.every((r) => r.length === 4));
});

ok("NVDA slices follow their rules", () => {
  const by = new Map(nvda.rows.map((r, i) => [r[0], { ratio: r[2], previous: i ? nvda.rows[i - 1][1] : null }]));
  assert.equal(col("all").values.length, nvda.rows.length);
  assert.ok(col("tuesday").values.every((x) => new Date(x.date + "T00:00:00Z").getUTCDay() === 2));
  assert.equal(col("month-end").values.length, new Set(nvda.rows.map((r) => r[0].slice(0, 7))).size - 1);
  assert.ok(col("after-holiday").values.some((x) => x.date === "2025-07-07") && !col("after-holiday").values.some((x) => x.date === "2025-07-14"));
  assert.ok(col("after-earnings").values.length % RULES.earningsSessions <= RULES.earningsSessions && col("after-earnings").values.some((x) => x.date === "2023-05-25"));
  assert.ok(col("ex-dividend").values.length > 0);
  assert.ok(col("high-volume").values.every((x) => by.get(x.date).ratio >= RULES.highVolume));
  assert.ok(col("low-volume").values.every((x) => by.get(x.date).ratio <= RULES.lowVolume));
  assert.ok(col("after-drop").values.every((x) => by.get(x.date).previous <= -RULES.bigMove));
  assert.ok(col("after-gain").values.every((x) => by.get(x.date).previous >= RULES.bigMove));
  assert.ok(byDay.every((c) => c.values.length && c.values.every((x) => bandIndex(MOVE_BANDS, x.v) >= 0)));
});

const nhanes = JSON.parse(read("data/nhanes-blood-pressure.json"));
const byGroup = nhanesColumns(nhanes), grp = (k) => byGroup.find((c) => c.key === k).values.length;
ok("NHANES: adults only, plausible readings, no identifiers, groups add up", () => {
  assert.deepEqual(nhanes.counts.map((c) => c.participants), [9756, 10175, 9971, 9254]);   // the CDC's published cycle sizes
  assert.equal(nhanes.rows.length, nhanes.counts.reduce((a, c) => a + c.adults_with_reading, 0));
  for (const [systolic, cycle, age, sex, bmi, ratio] of nhanes.rows) {
    assert.ok(systolic >= 60 && systolic <= 280 && cycle >= 0 && cycle < 4 && age >= 18 && age <= 80 && (sex === 1 || sex === 2));
    assert.ok((bmi == null || (bmi > 100 && bmi < 1000)) && (ratio == null || (ratio >= 0 && ratio <= 500)));
  }
  assert.equal(nhanes.rows[0].length, 6);
  assert.equal(grp("all"), nhanes.rows.length);
  assert.equal(grp("age-young") + grp("age-middle") + grp("age-older"), grp("all"));
  assert.equal(grp("men") + grp("women"), grp("all"));
  assert.equal(grp("bmi-low") + grp("bmi-mid") + grp("bmi-high"), nhanes.rows.filter((r) => r[4] != null).length);
  assert.ok(grp("income-low") + grp("income-high") < grp("all"));
  const median = (k) => arrange(byGroup, { bands: PRESSURE_BANDS }).find((c) => c.key === k).stats.med;
  assert.ok(median("age-young") < median("age-middle") && median("age-middle") < median("age-older"));
});

// ---------------------------------------------------------------- the chart

ok("one axis mixes calendar, company and numeric categories, each kind under its own bracket", () => {
  const g = arrange(byDay, { grouping: "grouped", bands: MOVE_BANDS });
  assert.deepEqual([...new Set(g.map((c) => c.bracket))], ["", "Calendar", "Company", "Volume", "Day before"]);
  assert.ok(g.filter((c) => c.bracket === "Day before").every((c) => /\d%/.test(c.label)));
  assert.ok(g.filter((c) => c.bracket === "Calendar").every((c) => !/\d/.test(c.label)));
});

ok("bar width by share: the widest bar in every column of equal shape is equal, whatever the column size", () => {
  const twin = [{ key: "a", label: "a", values: [1, 1, 2].map((v) => ({ v })) }, { key: "b", label: "b", values: Array.from({ length: 300 }, (_, k) => ({ v: k % 3 === 2 ? 2 : 1 })) }];
  const bands = [[0, 1.5, "low"], [1.5, 3, "high"]];
  const widths = (o) => [...buildChart({ title: "t", seriesName: "s", columns: twin, bands, scale: "linear", ...o }).svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="[\d.]+" class="hs-bar-face"/g)].map((m) => Number(m[1]));
  const share = widths({ widthBy: "share" }), count = widths({});
  assert.deepEqual(share.slice(0, 2), share.slice(2));
  assert.ok(count[0] < count[2]);
});

ok("time filter: every chart's values are dated; a span keeps exactly the values inside it", () => {
  for (const cols of [byOffice, byCity, byDay, byGroup]) {
    assert.ok(cols.every((c) => c.values.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))));
    const years = yearsOf(cols), total = (cs) => cs.reduce((a, c) => a + c.values.length, 0);
    assert.ok(years.length > 1);
    assert.equal(total(withinYears(cols, years[0], years[years.length - 1])), total(cols));
    const parts = years.map((y) => total(withinYears(cols, y, y)));
    assert.equal(parts.reduce((a, b) => a + b, 0), total(cols));
    const mid = withinYears(cols, years[1], years[1]);
    assert.ok(mid.every((c) => c.values.every((x) => x.date.slice(0, 4) === years[1])));
  }
  const y2023 = withinYears(byDay, "2023", "2023").find((c) => c.key === "all").values.length;
  assert.equal(y2023, nvda.rows.filter((r) => r[0].startsWith("2023")).length);
  assert.equal(arrange(withinYears(byCity, "1999", "1999"), { bands: CHANGE_BANDS }).length, 0);
});

ok("x-axis: reorder by name, by explicit keys, by function", () => {
  const keys = (o) => arrange(byOffice, o).map((c) => c.key);
  assert.deepEqual(keys({}), byOffice.map((c) => c.key));
  const med = arrange(byOffice, { sort: "median" });
  med.forEach((c, i) => i && assert.ok(med[i - 1].stats.med >= c.stats.med));
  assert.deepEqual(keys({ sort: ["ho", "nyro"] }).slice(0, 2), ["ho", "nyro"]);
  const asc = arrange(byOffice, { sort: (a, b) => a.stats.n - b.stats.n });
  asc.forEach((c, i) => i && assert.ok(asc[i - 1].stats.n <= c.stats.n));
  assert.deepEqual([...keys({ sort: "label" })].sort(), [...keys({})].sort());
});

ok("x-axis: grouped keeps each group together and sorted inside; combined loses no value", () => {
  for (const cols of [byOffice, byCity]) {
    const bands = cols === byCity ? CHANGE_BANDS : MONEY_BANDS;
    const g = arrange(cols, { grouping: "grouped", sort: "count", bands });
    assert.equal(g.length, cols.length);
    const runs = g.map((c) => c.bracket).filter((b, i, a) => !i || b !== a[i - 1]);
    assert.equal(runs.length, new Set(runs).size, "a group appears once, unbroken");
    g.forEach((c, i) => i && c.bracket === g[i - 1].bracket && assert.ok(g[i - 1].stats.n >= c.stats.n));
    const m = arrange(cols, { grouping: "combined", bands });
    assert.equal(m.reduce((a, c) => a + c.stats.n, 0), cols.reduce((a, c) => a + c.values.length, 0));
    assert.equal(m.length, new Set(cols.map((c) => c.group ?? c.key)).size);
  }
  const chart = buildChart({ title: "g", seriesName: "g", columns: byCity, bands: CHANGE_BANDS, scale: "linear", format: percent, grouping: "grouped" });
  assert.equal([...chart.svg.matchAll(/class="hs-bracket"/g)].length, new Set(byCity.map((c) => c.group)).size);
});

ok("text handed to the chart is escaped before it reaches the page", () => {
  const nasty = `<img src=x onerror="alert(1)">`;
  const chart = buildChart({ title: nasty, seriesName: nasty, columns: [{ key: nasty, label: nasty, group: nasty, values: [{ v: 5 }] }], bands: [[0, 10, nasty]], scale: "linear", grouping: "grouped" });
  assert.ok(!chart.svg.includes("<img") && chart.svg.includes("&lt;img"));
});

const pressure = { colWidth: 76, bands: PRESSURE_BANDS, scale: "linear", format: mmHg, widthBy: "share" };
const move = { colWidth: 76, bands: MOVE_BANDS, scale: "linear", format: percent, widthBy: "share" };
const money = { colWidth: 76 }, change = { colWidth: 76, bands: CHANGE_BANDS, scale: "linear", format: percent };
for (const [name, columns, opts] of [
  ["by office", byOffice, money], ["by year", byYear, money], ["by office, grouped", byOffice, { ...money, grouping: "grouped" }],
  ["blood pressure by group", byGroup, pressure], ["blood pressure by group, grouped", byGroup, { ...pressure, grouping: "grouped" }],
  ["NVDA by kind of day", byDay, move], ["NVDA by kind of day, grouped", byDay, { ...move, grouping: "grouped" }], ["NVDA by kind of day, combined", byDay, { ...move, grouping: "combined" }],
  ["by city", byCity, change], ["by city, grouped by median", byCity, { ...change, grouping: "grouped", sort: "median" }], ["by region, combined", byCity, { ...change, grouping: "combined" }],
]) {
  const bandsOf = opts.bands ?? MONEY_BANDS;
  const chart = buildChart({ title: name, seriesName: name, columns, ...opts });
  ok(`${name}: band counts, wick and median match the rows`, () => {
    chart.columns.forEach((c, i) => {
      const s = chart.stats[i], vs = c.values.map((x) => x.v);
      assert.equal(s.counts.reduce((a, b) => a + b, 0), vs.length);
      bandsOf.forEach((_, b) => assert.equal(s.counts[b], vs.filter((v) => bandIndex(bandsOf, v) === b).length));
      assert.equal(s.min, vs.reduce((a, b) => Math.min(a, b)));
      assert.equal(s.max, vs.reduce((a, b) => Math.max(a, b)));
      assert.ok(s.min <= s.med && s.med <= s.max && vs.includes(s.med));
    });
  });
  ok(`${name}: one bar drawn per occupied band, counts printed, all inside the frame`, () => {
    const bars = [...chart.svg.matchAll(/data-band="(\d+)" data-count="(\d+)"/g)];
    assert.equal(bars.length, chart.stats.reduce((a, s) => a + s.counts.filter(Boolean).length, 0));
    assert.equal(bars.reduce((a, m) => a + Number(m[2]), 0), chart.stats.reduce((a, s) => a + s.n, 0));
    assert.equal(chart.tips.length, chart.columns.length + bars.length);
    assert.ok(!/NaN|undefined|Infinity/.test(chart.svg));
    for (const m of chart.svg.matchAll(/ y[12]?="(-?[\d.]+)"/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= chart.height);
    for (const m of chart.svg.matchAll(/<rect x="(-?[\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) + Number(m[2]) <= chart.width);
  });
}

// ---------------------------------------------------------------- who offers it

ok("who offers it: licence, disclaimer, structured data and the page say the same thing", () => {
  const meta = JSON.parse(read("codemeta.json")), page = read("index.html");
  const embedded = JSON.parse(page.match(/<script type="application\/ld\+json" id="about-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(embedded["@context"], "https://schema.org");
  assert.deepEqual({ ...embedded, "@context": 0 }, { ...meta, "@context": 0 }, "run: node scripts/sync-meta.mjs");
  assert.equal(meta.license, "https://spdx.org/licenses/MIT");
  assert.ok(read("LICENSE").startsWith("MIT License") && read("LICENSE").includes(`Copyright (c) 2026 ${meta.publisher.legalName}`));
  assert.ok(page.includes(meta.publisher.description.replace("&", "&amp;")) && read("llms.txt").includes(meta.publisher.description));
  for (const text of [page, read("README.md"), read("llms.txt"), meta.usageInfo]) assert.ok(/as is/.test(text) && /no warranty/.test(text));
  for (const part of meta.hasPart) assert.ok(read(part.url).length > 0, part.url);   // every file it describes exists
  assert.ok(page.includes('src="assets/4street-logo.png"'));
});

// ---------------------------------------------------------------- self-contained and safe to download

const walk = (dir) => readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const shipped = ["src", "scripts", "data", "assets"].flatMap(walk);
const pageCode = shipped.filter((f) => f.startsWith("src/") && f.endsWith(".js"));
const tools = shipped.filter((f) => f.startsWith("scripts/"));
const j = (...parts) => parts.join("");   // the words looked for are spelled in pieces so this file does not trip itself

ok("no packages: no manifest, lock file or installed modules anywhere", () => {
  for (const name of ["package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", ".npmrc", "node_modules"]) assert.ok(!existsSync(resolve(root, name)), name);
  assert.deepEqual([...new Set(shipped.map((f) => extname(f)))].sort(), [".css", ".js", ".json", ".mjs", ".png", ".svg"]);
});

ok("every import is a file in this folder or a Node built-in on a short list", () => {
  const allowed = new Set(["node:assert/strict", "node:fs", "node:fs/promises", "node:http", "node:path", "node:url", "node:crypto"]);
  for (const file of [...pageCode, ...tools]) {
    const text = read(file);
    const named = [...text.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm), ...text.matchAll(/^\s*import\s+"([^"]+)"/gm)].map((m) => m[1]);
    for (const from of named) {
      const local = from.startsWith("./") || from.startsWith("../");
      assert.ok(local || (file.startsWith("scripts/") && allowed.has(from)), `${file} imports ${from}`);
    }
    assert.ok(!new RegExp(j("\\bimp", "ort\\s*\\(")).test(text), `${file} loads code at run time`);
  }
});

ok("page code cannot run text as code, store anything, or talk to another site", () => {
  const banned = [j("ev", "al("), j("new Fun", "ction"), j("document.wr", "ite"), j("XMLHttp", "Request"), j("Web", "Socket"), j("send", "Beacon"), j("local", "Storage"), j("session", "Storage"), j("document.coo", "kie"), j("indexed", "DB"), j("import", "Scripts"), j("post", "Message"), j("window.op", "en")];
  for (const file of pageCode) {
    const text = read(file);
    for (const word of banned) assert.ok(!text.includes(word), `${file} uses ${word}`);
    assert.ok(!/https?:\/\/|["'`]\/\//.test(text.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")), `${file} names another site`);
  }
  for (const file of shipped.filter((f) => f.endsWith(".css"))) assert.ok(!/url\(|@import|https?:/.test(read(file)), `${file} loads something`);
  // the only network call in the page is one helper, and it is only ever given files in data/
  const fetches = pageCode.flatMap((f) => [...read(f).matchAll(/\bfetch\(/g)].map(() => f));
  assert.deepEqual(fetches, ["src/page.js"]);
  const loaded = [...read("src/page.js").matchAll(/\bload\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(loaded.length > 0 && loaded.every((f) => /^data\/[a-z0-9-]+\.json$/.test(f)));
});

ok("the page loads only its own files: no outside scripts, styles, images, frames or inline code", () => {
  const page = read("index.html");
  const outbound = new Set(["https://its4street.com", "mailto:contact@its4street.com", "https://github.com/its-4Street/histostick"]);
  for (const [, , address] of page.matchAll(/\s(src|href)="([^"]*)"/g)) {
    const own = !/^[a-z][a-z0-9+.-]*:/i.test(address) && !address.startsWith("/") && !address.includes("..");
    assert.ok(own || outbound.has(address), `index.html points at ${address}`);
  }
  for (const [tag] of page.matchAll(/<(script|link|img)\b[^>]*>/g)) {
    const address = tag.match(/\s(?:src|href)="([^"]*)"/)?.[1];
    assert.ok(!address || !outbound.has(address), `index.html loads ${address}`);
  }
  assert.ok(!/<(iframe|object|embed|style|base|form)\b/i.test(page));
  assert.ok(!/\son[a-z]+\s*=/i.test(page) && !/\sstyle\s*=/i.test(page) && !/javascript:/i.test(page));
  const scripts = [...page.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1].trim());
  assert.deepEqual(scripts, ['type="application/ld+json" id="about-data"', 'type="module" src="src/page.js"']);
});

ok("the scripts use Node built-ins only: they run no other program, open no outside connection, read no environment", () => {
  const banned = [j("child_", "process"), j("node:", "net"), j("node:", "https"), j("node:", "tls"), j("node:", "dgram"), j("node:", "vm"), j("node:", "worker_threads"), j("node:", "cluster"), j("process.", "env"), j("ev", "al("), j("new Fun", "ction"), j("exec", "Sync"), j("spa", "wn(")];
  for (const file of tools) {
    const text = read(file);
    for (const word of banned) assert.ok(!text.includes(word), `${file} uses ${word}`);
    if (text.includes(j("fet", "ch("))) assert.equal(file, "scripts/verify.mjs", `${file} makes a network call`);
  }
  assert.ok(read("scripts/serve.mjs").includes('"127.0.0.1"'));   // the server listens on this machine only
  for (const [, address] of read("scripts/verify.mjs").matchAll(/fetch\(([^)]*)\)/g)) assert.ok(address.startsWith("base"), address);
});

ok("nothing shipped names a folder on someone's machine; the images are what they claim to be", () => {
  const text = (f) => ![".png"].includes(extname(f));
  for (const file of [...shipped.filter(text), "index.html", "README.md", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "codemeta.json", "llms.txt", "LICENSE"]) {
    const body = read(file);
    assert.ok(!body.includes(j("/ho", "me/")) && !body.includes(j("/Us", "ers/")) && !/[A-Z]:\\\\/.test(body), `${file} names a local folder`);
  }
  const png = readFileSync(resolve(root, "assets/4street-logo.png"));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const icon = read("assets/favicon.svg");
  assert.ok(icon.trimStart().startsWith("<svg") && !/<script|\son[a-z]+=|href=|<foreignObject/i.test(icon));
});

// ---------------------------------------------------------------- the served page

const server = await start(0);
const base = `http://127.0.0.1:${server.address().port}`;
const pages = ["/", "/LICENSE", "/codemeta.json", "/llms.txt", "/assets/4street-logo.png", "/assets/favicon.svg", "/src/page.js", "/src/histostick.js", "/src/histostick.css", "/src/style.css", "/src/sec-data.js", "/src/sec-columns.js", "/src/dummy-columns.js", "/src/nvda-columns.js", "/src/nhanes-columns.js", "/data/dummy-home-prices.json", "/data/nvda-moves.json", "/data/nhanes-blood-pressure.json"];
for (const p of pages) {
  const r = await fetch(base + p);
  assert.equal(r.status, 200, p);
}
for (const p of ["/package.json", "/scripts", "/..%2f..%2fetc/passwd"]) {
  const r = await fetch(base + p);
  assert.equal(r.status, 404, p);
}
const malformed = await fetch(base + "/%E0%A4%A");
assert.equal(malformed.status, 400);
const after = await fetch(base + "/");
assert.equal(after.status, 200);
server.close();
n++;
console.log("ok  page, modules and data are served; nothing outside the project is; a malformed address does not stop the server");
console.log(`\n${n} checks passed`);
