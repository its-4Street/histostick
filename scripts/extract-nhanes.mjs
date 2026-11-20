#!/usr/bin/env node
// Builds data/nhanes-blood-pressure.json from the CDC's NHANES public-use files.
//
//   node scripts/extract-nhanes.mjs <folder holding the .xpt files>
//
// NHANES (National Health and Nutrition Examination Survey, CDC / National Center for Health Statistics) examines a
// sample of the US population in two-year cycles. Files used, for the cycles 2011-2012 (G), 2013-2014 (H),
// 2015-2016 (I) and 2017-2018 (J):
//   DEMO_x.xpt  demographics       SEQN, RIAGENDR (sex), RIDAGEYR (age), INDFMPIR (family income / poverty line)
//   BPX_x.xpt   blood pressure     BPXSY1..BPXSY4 (systolic readings, mm Hg)
//   BMX_x.xpt   body measures      BMXBMI (body mass index)
// from https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/<first year>/DataFiles/<FILE>_<x>.xpt
//
// One row per adult (18 and over) with at least one systolic reading:
//   [systolic (mean of the readings taken, rounded), cycle index, age, sex (1 male, 2 female), BMI x10 or null,
//    income ratio x100 or null]
// No participant identifiers are kept. These are counts of examined people, NOT national estimates: the survey's
// sampling weights are not applied.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(process.argv[2] ?? ".");
const CYCLES = [["G", "2011-2012"], ["H", "2013-2014"], ["I", "2015-2016"], ["J", "2017-2018"]];

/** Reads a SAS transport (XPORT version 5) file: returns the wanted numeric variables for every row. */
function readXpt(path, wanted) {
  const buf = readFileSync(path);
  const names = buf.indexOf("HEADER RECORD*******NAMESTR HEADER RECORD!!!!!!!", 0, "latin1");
  const obs = buf.indexOf("HEADER RECORD*******OBS     HEADER RECORD!!!!!!!", 0, "latin1");
  if (names < 0 || obs < 0) throw new Error(`${path}: not a SAS transport file`);
  const count = Number(buf.toString("latin1", names + 54, names + 58));
  const size = (obs - names - 80) / count >= 140 ? 140 : 136;
  const vars = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const at = names + 80 + i * size;
    const numeric = buf.readInt16BE(at) === 1, length = buf.readInt16BE(at + 4);
    vars.push({ name: buf.toString("latin1", at + 8, at + 16).trim(), numeric, length, offset });
    offset += length;
  }
  const rowLength = offset, start = obs + 80, rows = [];
  const pick = wanted.map((w) => {
    const v = vars.find((x) => x.name === w);
    if (!v || !v.numeric) throw new Error(`${path}: no numeric variable ${w}`);
    return v;
  });
  for (let at = start; at + rowLength <= buf.length; at += rowLength) {
    if (buf.subarray(at, at + rowLength).every((b) => b === 0x20)) continue;   // padding at the end of the file
    rows.push(pick.map((v) => ibm(buf, at + v.offset, v.length)));
  }
  return rows;
}

/** IBM hexadecimal floating point (what SAS transport stores) -> number, or null for a SAS missing value. */
function ibm(buf, at, length) {
  const first = buf[at];
  let rest = 0;
  for (let i = 1; i < length; i++) rest |= buf[at + i];
  if (rest === 0 && (first === 0x2e || first === 0x5f || (first >= 0x41 && first <= 0x5a))) return null;
  if (first === 0 && rest === 0) return 0;
  let mantissa = 0;
  for (let i = 1; i < length; i++) mantissa = mantissa * 256 + buf[at + i];
  const value = (mantissa / 2 ** (8 * (length - 1))) * 16 ** ((first & 0x7f) - 64);
  return first & 0x80 ? -value : value;
}

const rows = [], counts = [];
CYCLES.forEach(([letter], ci) => {
  const demo = new Map(readXpt(resolve(dir, `DEMO_${letter}.xpt`), ["SEQN", "RIAGENDR", "RIDAGEYR", "INDFMPIR"]).map((r) => [r[0], r]));
  const bmi = new Map(readXpt(resolve(dir, `BMX_${letter}.xpt`), ["SEQN", "BMXBMI"]).map((r) => [r[0], r[1]]));
  let kept = 0;
  for (const [seqn, ...readings] of readXpt(resolve(dir, `BPX_${letter}.xpt`), ["SEQN", "BPXSY1", "BPXSY2", "BPXSY3", "BPXSY4"])) {
    const taken = readings.filter((x) => x != null && x > 0), person = demo.get(seqn);
    if (!taken.length || !person || person[2] == null || person[2] < 18) continue;
    const b = bmi.get(seqn), pir = person[3];
    rows.push([Math.round(taken.reduce((a, x) => a + x, 0) / taken.length), ci, Math.round(person[2]), person[1], b == null ? null : Math.round(b * 10), pir == null ? null : Math.round(pir * 100)]);
    kept++;
  }
  counts.push({ cycle: CYCLES[ci][1], participants: demo.size, adults_with_reading: kept });
});

const out = {
  schema: "histostick/nhanes-blood-pressure/v1",
  source: "National Health and Nutrition Examination Survey (NHANES), CDC National Center for Health Statistics, public-use files DEMO, BPX and BMX.",
  url: "https://wwwn.cdc.gov/nchs/nhanes/",
  note: "Counts of examined adults, not national estimates: the survey's sampling weights are not applied.",
  cycles: CYCLES.map(([, label]) => label),
  counts,
  columns: ["systolic", "cycle", "age", "sex", "bmi_x10", "income_ratio_x100"],
  rows,
};
const dest = resolve(dirname(fileURLToPath(import.meta.url)), "../data/nhanes-blood-pressure.json");
writeFileSync(dest, JSON.stringify(out) + "\n");
console.log(`${rows.length} adults -> ${dest}`);
for (const c of counts) console.log(` ${c.cycle}: ${c.adults_with_reading} of ${c.participants} participants`);
