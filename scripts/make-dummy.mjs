#!/usr/bin/env node
// Writes the MADE-UP set for the demonstration chart:
//
//   data/dummy-home-prices.json     price change in a year, homes with a 2 in the address, by city
//
//   node scripts/make-dummy.mjs
//
// The cities do not exist and no figure here was measured from anything: every value comes from the seeded random
// generator below, so the file is the same on every run.
// One row per home: [percentChange, cityIndex, saleDate].
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function generator(seed) {
  let a = seed >>> 0;
  const rand = () => {   // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { rand, bell: () => rand() + rand() + rand() + rand() - 2 };   // bell: roughly normal, about -2..2
}

const CITIES = [
  ["Port Alder", "Coast"], ["Gullwick", "Coast"], ["Saltmere", "Coast"], ["Brine Harbor", "Coast"],
  ["Quillford", "Valley"], ["Marrow Bend", "Valley"], ["Oatfield", "Valley"], ["Lower Tansy", "Valley"],
  ["Cinder Gap", "Hills"], ["Upper Wren", "Hills"], ["Flintlow", "Hills"], ["Goat Summit", "Hills"],
];

/** Homes with a 2 in the address: percent price change in a year, by city. */
export function makeDummy(seed = 2222) {
  const { rand, bell } = generator(seed);
  const when = generator(seed + 7).rand;   // sale dates come from their own stream, so the values never shift
  const rows = [];
  CITIES.forEach((_, ci) => {
    const homes = 6 + Math.floor(rand() * 33), centre = -6 + rand() * 18, spread = 4 + rand() * 6;
    for (let i = 0; i < homes; i++) {
      const sold = `${2022 + Math.floor(when() * 4)}-${String(1 + Math.floor(when() * 12)).padStart(2, "0")}-${String(1 + Math.floor(when() * 28)).padStart(2, "0")}`;
      rows.push([Math.round((centre + bell() * spread) * 10) / 10, ci, sold]);
    }
  });
  return {
    schema: "histostick/dummy-home-prices/v2",
    fictional: true,
    note: "Made-up numbers for demonstration. The cities do not exist.",
    seed,
    cities: CITIES.map(([name, region]) => ({ name, region })),
    rows,
  };
}

export const SETS = {
  "dummy-home-prices.json": makeDummy,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [file, make] of Object.entries(SETS)) {
    const dest = resolve(dirname(fileURLToPath(import.meta.url)), "../data", file), out = make();
    writeFileSync(dest, JSON.stringify(out) + "\n");
    console.log(`${out.rows.length} made-up rows -> ${dest}`);
  }
}
