/**
 * Chart inputs for the made-up home-price set (data/dummy-home-prices.json): one column per city, grouped by region,
 * each value one home's price change over a year, in percent.
 */
export const CHANGE_BANDS = [
  [-Infinity, -10, "Below -10%"],
  [-10, -5, "-10% to -5%"],
  [-5, 0, "-5% to 0%"],
  [0, 5, "0% to 5%"],
  [5, 10, "5% to 10%"],
  [10, 20, "10% to 20%"],
  [20, Infinity, "20% and up"],
];

export const percent = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** Any made-up set -> chart columns. Rows are [value, columnIndex, date]; a column is { name, group }. */
export function dummyColumns(set) {
  const cols = set.columns ?? set.cities.map((c) => ({ name: c.name, group: c.region }));
  const columns = cols.map((c) => ({ key: c.name, label: c.name, group: c.group, values: [] }));
  for (const [v, i, date] of set.rows) columns[i].values.push({ v, date });
  return columns;
}
