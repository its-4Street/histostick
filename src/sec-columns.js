/**
 * Turns the SEC sample (SEC_ROWS in src/sec-data.js) into chart columns.
 * Each row is [amount, date, officeCodes]; a respondent with two offices appears in both office columns.
 */
export const OFFICE = {
  "not-printed": "Not printed", ho: "HO", nyro: "NY", bro: "Boston", plro: "Phila.", miro: "Miami", atro: "Atlanta",
  chro: "Chicago", dro: "Denver", fwro: "Fort Worth", laro: "LA", sfro: "SF", slro: "Salt Lake",
};

/** Where each office sits, for grouping the x-axis (census regions; the home office and "not printed" stand alone). */
export const OFFICE_REGION = {
  nyro: "Northeast", bro: "Northeast", plro: "Northeast",
  atro: "South", miro: "South", fwro: "South",
  chro: "Midwest",
  dro: "West", slro: "West", laro: "West", sfro: "West",
};

export function secColumns(rows) {
  const off = new Map(), year = new Map();
  for (const [v, date, offices] of rows) {
    for (const o of offices) {
      const c = off.get(o) ?? { key: o, label: OFFICE[o] ?? o.toUpperCase(), group: OFFICE_REGION[o], values: [] };
      c.values.push({ v, date });
      off.set(o, c);
    }
    const y = date.slice(0, 4);
    const c = year.get(y) ?? { key: y, label: y, values: [] };
    c.values.push({ v, date });
    year.set(y, c);
  }
  return {
    byOffice: [...off.values()].sort((a, b) => b.values.length - a.values.length),   // busiest office first
    byYear: [...year.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),              // oldest year first
  };
}
