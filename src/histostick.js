/**
 * Histostick: a histogram-candlestick chart. Plain ES module, SVG, no dependencies.
 * Its styles are in histostick.css; the two files are all the chart needs.
 *
 * One column per series (an SEC office, a year, a city). Inside each column:
 *   - band bars: one bar per band present in the data; bar WIDTH = how many values fall in that band, count beside it;
 *   - wick: the series' smallest to largest value, with caps;
 *   - median tick: the series' median value.
 * Hover (or tap) a bar for a callout with the series, the band's range, the count and its share; hover the column
 * elsewhere for the series summary. Bands are equal-height rows covering only the bands in the data, so the chart
 * is not mostly empty space; values are placed inside their row on a log or linear scale.
 *
 * The x-axis can be reordered and grouped: see `arrange`.
 *
 * Input: columns = [{ key, label, values: [{ v }], group? }]
 */
export const MONEY_BANDS = [
  [0, 10_000, "<$10K"],
  [10_000, 100_000, "$10K–100K"],
  [100_000, 500_000, "$100K–500K"],
  [500_000, 1_000_000, "$500K–1M"],
  [1_000_000, 10_000_000, "$1M–10M"],
  [10_000_000, 100_000_000, "$10M–100M"],
  [100_000_000, 1_000_000_000, "$100M–1B"],
  [1_000_000_000, Infinity, "$1B+"],
];

export const money = (v) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`;
export const bandIndex = (bands, v) => bands.findIndex(([lo, hi]) => v >= lo && v < hi);
export const bandOf = (v) => bandIndex(MONEY_BANDS, v);

/** Per-column numbers: smallest, largest, median, total, and the count in each band. Values outside every band are left out. */
export function columnStats(column, bands = MONEY_BANDS) {
  const vs = column.values.map((x) => x.v).filter((v) => bandIndex(bands, v) >= 0).sort((a, b) => a - b);
  const counts = bands.map(() => 0);
  for (const v of vs) counts[bandIndex(bands, v)]++;
  return { n: vs.length, min: vs[0], max: vs[vs.length - 1], med: vs[Math.floor((vs.length - 1) / 2)], total: vs.reduce((a, b) => a + b, 0), counts };
}

/** Named orders for the x-axis. "given" keeps the order the columns were passed in. */
export const SORTS = {
  given: null,
  count: (a, b) => b.stats.n - a.stats.n,
  median: (a, b) => b.stats.med - a.stats.med,
  total: (a, b) => b.stats.total - a.stats.total,
  label: (a, b) => a.label.localeCompare(b.label, "en", { numeric: true }),
};

/**
 * Orders and groups the x-axis. Returns the columns to draw, each with its `stats`.
 *   sort:     a name from SORTS, an array of column keys (explicit order; unlisted keys go last), or a compare function
 *   grouping: "none"     every column on its own, in sort order
 *             "grouped"  columns that share a `group` sit together under a bracket, sorted inside the group;
 *                        groups are placed by their first column in sort order
 *             "combined" each group becomes ONE column holding all of its members' values
 * Columns without a `group` are never moved into one.
 */
export function arrange(columns, { sort = "given", grouping = "none", bands = MONEY_BANDS } = {}) {
  let cols = columns.filter((c) => c.values.length);
  if (!cols.some((c) => c.group)) grouping = "none";
  if (grouping === "combined") {
    const merged = new Map(), next = [];
    for (const c of cols) {
      if (!c.group) { next.push(c); continue; }
      let m = merged.get(c.group);
      if (!m) {
        m = { key: `group:${c.group}`, label: c.group, values: [], members: [] };
        merged.set(c.group, m);
        next.push(m);
      }
      m.values.push(...c.values);
      m.members.push(c.label);
    }
    cols = next;
  }
  let out = cols.map((c) => ({ ...c, stats: columnStats(c, bands) })).filter((c) => c.stats.n);
  const at = (c) => { const i = sort.indexOf(c.key); return i < 0 ? Infinity : i; };
  const cmp = Array.isArray(sort) ? (a, b) => at(a) - at(b) : typeof sort === "function" ? sort : SORTS[sort];
  if (cmp) out = [...out].sort(cmp);
  if (grouping === "grouped") {
    const order = [...new Set(out.map((c) => c.group ?? ""))];
    out = order.flatMap((g) => out.filter((c) => (c.group ?? "") === g));
  }
  return out.map((c) => ({ ...c, bracket: grouping === "grouped" ? (c.group ?? "") : "" }));
}

/** The years the values fall in, oldest first (from each value's `date`, "YYYY-MM-DD"). */
export const yearsOf = (columns) => [...new Set(columns.flatMap((c) => c.values.map((x) => x.date?.slice(0, 4))).filter(Boolean))].sort();

/** The same columns holding only the values dated from year `from` through year `to`, inclusive. */
export function withinYears(columns, from, to) {
  return columns.map((c) => ({ ...c, values: c.values.filter((x) => x.date && x.date.slice(0, 4) >= from && x.date.slice(0, 4) <= to) }));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const n2 = (v) => Math.round(v * 100) / 100;
const AX = 78, TOP = 10, GAP = 6, DEPTH = 5, PAD = 10, GROUP_GAP = 16;
const CHAR = 6.3, TILT = 35, COS = Math.cos((TILT * Math.PI) / 180), SIN = Math.sin((TILT * Math.PI) / 180);   // 10px mono labels

/**
 * Everything needed to draw: the SVG markup, its size, and the callouts (indexed by the data-tip attribute).
 * Pure, so it runs in Node as well as the browser.
 *
 * Options beyond title / seriesName / columns / colWidth:
 *   bands      [[lo, hi, label], ...] in ascending order (default: the money bands)
 *   scale      "log" (default) or "linear": how a value is placed inside its band row
 *   format     value -> text for callouts (default: money)
 *   unit       what is being counted, plural (default "Respondents")
 *   showTotal  include the column total in the summary callout (default true; off when a sum means nothing)
 *   bandRange  spell out the band's range in the callout (default true; off when the label already says it)
 *   widthBy    "count" (default): bar width follows the count, comparable across the whole chart;
 *              "share": bar width follows the band's share of ITS column, so a column of 20 and a column of
 *              1,400 show their shapes side by side (the counts are still printed)
 *   sort, grouping   see `arrange`
 */
export function buildChart({
  title, seriesName, columns, colWidth = 64, bands = MONEY_BANDS, scale = "log", format = money,
  unit = "Respondents", showTotal = true, bandRange = true, sort = "given", grouping = "none", widthBy = "count",
}) {
  const cols = arrange(columns, { sort, grouping, bands });
  if (!cols.length) return null;
  const stats = cols.map((c) => c.stats);

  // only the bands the data uses, as equal-height rows
  const used = bands.map((_, i) => stats.some((s) => s.counts[i] > 0));
  const bLo = used.indexOf(true), bHi = used.lastIndexOf(true);
  const rows = bHi - bLo + 1;
  const ROW = Math.max(30, Math.min(48, Math.round(300 / rows)));

  // x labels: flat when the longest fits its column, tilted otherwise. Under the plot, top to bottom:
  // n= row, the labels, then (when grouped) the brackets.
  const longest = Math.max(...cols.map((c) => c.label.length));
  const flat = longest * CHAR <= colWidth + GAP - 6;
  const labelDrop = flat ? 10 : Math.ceil(longest * CHAR * SIN) + 8;
  const bracketed = cols.some((c) => c.bracket);
  const BOT = 30 + labelDrop + (bracketed ? 30 : 4);
  // a tilted label runs down and to the left of its column: start far enough in that the first one is whole
  const lead = flat ? 0 : Math.max(0, Math.ceil(cols[0].label.length * CHAR * COS - colWidth / 2 - 4) + 8);
  // column positions: a wider gap wherever the bracket changes
  const xs = [];
  let x = AX + lead;
  cols.forEach((c, i) => {
    if (i && c.bracket !== cols[i - 1].bracket) x += GROUP_GAP;
    xs.push(x);
    x += colWidth + GAP;
  });
  const height = rows * ROW, W = x + PAD, H = TOP + height + BOT;
  const rowTop = (b) => TOP + (bHi - b) * ROW;
  const dataMin = Math.min(...stats.map((s) => s.min)), dataMax = Math.max(...stats.map((s) => s.max));
  const y = (v) => {
    const b = Math.min(Math.max(bandIndex(bands, v), bLo), bHi);
    let f;
    if (scale === "log") {
      const lo = Math.max(bands[b][0], 1_000), hi = Math.min(bands[b][1], 1e10);
      f = (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
    } else {
      // an open-ended band runs to the furthest value in the data
      const lo = Number.isFinite(bands[b][0]) ? bands[b][0] : Math.min(dataMin, bands[b][1]);
      const hi = Number.isFinite(bands[b][1]) ? bands[b][1] : Math.max(dataMax, bands[b][0]);
      f = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    }
    return n2(rowTop(b) + ROW * (1 - Math.min(1, Math.max(0, f))));
  };
  const maxCount = Math.max(1, ...stats.flatMap((s) => s.counts));
  const maxShare = Math.max(...stats.flatMap((s) => s.counts.map((n) => n / s.n)));
  const maxBar = colWidth - 30 - DEPTH;

  const tips = [];
  const tip = (series, lines) => tips.push({ series, lines }) - 1;
  const out = [], axis = [];   // the plot, and the band labels (kept apart so the axis can stay put while the plot scrolls)

  for (let i = 0; i < rows; i++) {
    const b = bHi - i;
    out.push(`<rect x="${AX}" y="${rowTop(b)}" width="${W - AX - 6}" height="${ROW}" class="${(b - bLo) % 2 === 0 ? "hs-row" : "hs-row-clear"}"/>`);
    axis.push(`<text x="${AX - 8}" y="${rowTop(b) + ROW / 2 + 3}" text-anchor="end" class="hs-axis">${esc(bands[b][2])}</text>`);
  }

  const base = TOP + height;
  cols.forEach((c, ci) => {
    const s = stats[ci], x0 = xs[ci], cx = x0 + colWidth / 2;
    const series = `${seriesName}: ${c.label}`;
    const summary = tip(series, [
      ...(c.members ? [["Combines", c.members.join(", ")]] : []),
      [unit, String(s.n)],
      ["Smallest", format(s.min)],
      ["Median", format(s.med)],
      ["Largest", format(s.max)],
      ...(showTotal ? [["Total", format(s.total)]] : []),
    ]);
    const labels = [];
    out.push(`<g data-col="${esc(c.key)}">`);
    // hover target for the whole column (series summary)
    out.push(`<rect x="${x0}" y="${TOP}" width="${colWidth}" height="${height}" class="hs-hit" data-tip="${summary}"/>`);
    out.push(
      `<line x1="${cx}" x2="${cx}" y1="${y(s.max)}" y2="${y(s.min)}" class="hs-wick"/>`,
      `<line x1="${cx - 5}" x2="${cx + 5}" y1="${y(s.max)}" y2="${y(s.max)}" class="hs-wick"/>`,
      `<line x1="${cx - 5}" x2="${cx + 5}" y1="${y(s.min)}" y2="${y(s.min)}" class="hs-wick"/>`,
    );
    s.counts.forEach((n, b) => {
      if (!n || b < bLo || b > bHi) return;
      const h = ROW - 8, w = n2(Math.max((widthBy === "share" ? n / s.n / maxShare : Math.sqrt(n / maxCount)) * maxBar, 6));
      const bx = n2(cx - (w + DEPTH) / 2 + 6), by = rowTop(b) + 4;
      const [lo, hi, label] = bands[b];
      const detail = tip(series, [
        ["Band", label + (bandRange && Number.isFinite(lo) && Number.isFinite(hi) ? ` (${format(lo)} up to ${format(hi)})` : "")],
        [unit, `${n} of ${s.n} (${Math.round((100 * n) / s.n)}%)`],
        ["Series median", format(s.med)],
      ]);
      out.push(
        `<g class="hs-bar" data-tip="${detail}" data-band="${b}" data-count="${n}">`,
        `<polygon points="${bx},${by} ${bx + DEPTH},${by - DEPTH} ${n2(bx + w + DEPTH)},${by - DEPTH} ${n2(bx + w)},${by}" class="hs-bar-top"/>`,
        `<polygon points="${n2(bx + w)},${by} ${n2(bx + w + DEPTH)},${by - DEPTH} ${n2(bx + w + DEPTH)},${by + h - DEPTH} ${n2(bx + w)},${by + h}" class="hs-bar-side"/>`,
        `<rect x="${bx}" y="${by}" width="${w}" height="${h}" class="hs-bar-face"/>`,
        `</g>`,
      );
      labels.push(`<text x="${n2(bx - 5)}" y="${by + h / 2 + 4}" text-anchor="end" class="hs-count" data-tip="${detail}">${n}</text>`);
    });
    out.push(
      `<line x1="${x0 + 4}" x2="${x0 + colWidth - 4}" y1="${y(s.med)}" y2="${y(s.med)}" class="hs-median"/>`,
      ...labels,
      `<text x="${cx}" y="${base + 13}" text-anchor="middle" class="hs-n">n=${s.n}</text>`,
      flat
        ? `<text x="${cx}" y="${base + 30}" text-anchor="middle" class="hs-axis hs-label">${esc(c.label)}</text>`
        : `<text x="${cx + 4}" y="${base + 28}" text-anchor="end" transform="rotate(-${TILT} ${cx + 4} ${base + 28})" class="hs-axis hs-label">${esc(c.label)}</text>`,
      `</g>`,
    );
  });

  // one bracket under each run of columns that share a group
  for (let i = 0; i < cols.length; ) {
    let j = i;
    while (j + 1 < cols.length && cols[j + 1].bracket === cols[i].bracket) j++;
    if (cols[i].bracket) {
      const x1 = xs[i] + 2, x2 = xs[j] + colWidth - 2, by = base + 30 + labelDrop;
      out.push(
        `<path d="M${x1},${by - 4} V${by} H${x2} V${by - 4}" class="hs-bracket" data-group="${esc(cols[i].bracket)}"/>`,
        `<text x="${(x1 + x2) / 2}" y="${by + 14}" text-anchor="middle" class="hs-group">${esc(cols[i].bracket)}</text>`,
      );
    }
    i = j + 1;
  }

  // `svg` is the whole chart in one piece; `axisSvg` + `plotSvg` are the same drawing cut at the axis edge
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">${axis.join("")}${out.join("")}</svg>`;
  const axisSvg = `<svg viewBox="0 0 ${AX} ${H}" width="${AX}" height="${H}" aria-hidden="true">${axis.join("")}</svg>`;
  const plotSvg = `<svg viewBox="${AX} 0 ${W - AX} ${H}" width="${W - AX}" height="${H}" role="img" aria-label="${esc(title)}">${out.join("")}</svg>`;
  return { svg, axisSvg, plotSvg, width: W, height: H, tips, stats, columns: cols, bands: [bLo, bHi], flat, lead };
}

const legend = ({ unit = "Respondents", bandNoun = "money band", valueNoun = "amount", widthBy = "count" }) =>
  `<span class="hs-key"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" class="hs-bar-face"/></svg>${esc(unit)} in a ${esc(bandNoun)} (${widthBy === "share" ? "bar width is the share of its column; " : ""}count beside the bar)</span>` +
  `<span class="hs-key"><svg width="14" height="10" aria-hidden="true"><line x1="7" x2="7" y1="0" y2="10" class="hs-wick"/><line x1="3" x2="11" y1="0.5" y2="0.5" class="hs-wick"/><line x1="3" x2="11" y1="9.5" y2="9.5" class="hs-wick"/></svg>Smallest to largest ${esc(valueNoun)}</span>` +
  `<span class="hs-key"><svg width="18" height="10" aria-hidden="true"><line x1="0" x2="18" y1="5" y2="5" class="hs-median"/></svg>Median ${esc(valueNoun)}</span>` +
  `<span>Hover a bar for detail</span>`;

const GROUPINGS = [["none", "Each on its own"], ["grouped", "Grouped"], ["combined", "Combined into one"]];

/**
 * Draws the chart into `el` (replacing its contents) and wires the hover / tap callout. Browser only.
 * Columns are sized to fill `el` (between `minColWidth` and `maxColWidth`) and redrawn when it resizes; below the
 * minimum the chart scrolls sideways with the band axis pinned. Pass `colWidth` to fix the width instead.
 *
 * Unless `controls: false`, the reader gets an Order menu (`sorts`: which SORTS names to offer) and, when any
 * column carries a `group`, a Groups menu (`groupName`: what a group is, e.g. "Regions"). When the values carry
 * dates spanning more than one year, a two-handle year slider narrows the chart to that span (`time: false` hides it).
 * Legend wording: `unit`, `bandNoun`, `valueNoun`.
 */
export function mountChart(el, options) {
  const { minColWidth = 56, maxColWidth = 96, controls = true, groupName = "Groups", unit = "Respondents" } = options;
  if (!options.columns.some((c) => c.values.length)) {
    el.replaceChildren();
    return null;
  }
  const years = options.time === false ? [] : yearsOf(options.columns);
  const timed = years.length > 1;
  const state = { sort: "given", grouping: options.grouping ?? "none", from: options.from ?? years[0], to: options.to ?? years[years.length - 1] };
  const startSort = options.sort ?? "given";
  const custom = typeof startSort !== "string";          // an explicit order or compare function is the "Default" entry
  if (!custom) state.sort = startSort;
  const sortNames = { given: "Default", count: `Most ${unit.toLowerCase()}`, median: "Highest median", total: "Largest total", label: "A to Z" };
  const sorts = options.sorts ?? ["given", "count", "median", ...(options.showTotal === false ? [] : ["total"]), "label"];
  const grouped = options.columns.some((c) => c.group);
  const menu = (name, label, items, value) =>
    `<label class="hs-control">${esc(label)}<select data-control="${esc(name)}">${items.map(([v, t]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;

  // one track, two handles: the inputs hold positions in `years`, the state holds the years themselves
  const handle = (name, label) => `<input type="range" data-control="${name}" min="0" max="${years.length - 1}" step="1" value="${years.indexOf(state[name])}" aria-label="${label}">`;
  const slider = `<div class="hs-control hs-span">Years<span class="hs-slider">${handle("from", "From year")}${handle("to", "To year")}</span><output class="hs-span-text"></output></div>`;

  el.innerHTML =
    `<figure class="hs"><figcaption class="hs-caption"><span class="hs-title">${esc(options.title)}</span><span class="hs-legend">${legend(options)}</span></figcaption>` +
    (controls
      ? `<div class="hs-controls">${menu("sort", "Order", sorts.map((k) => [k, sortNames[k] ?? k]), state.sort)}${grouped ? menu("grouping", groupName, GROUPINGS, state.grouping) : ""}` +
        `${timed ? slider : ""}</div>`
      : "") +
    `<div class="hs-wrap"><div class="hs-plot"></div><div class="hs-tip" hidden></div></div></figure>`;
  const wrap = el.querySelector(".hs-wrap"), plot = el.querySelector(".hs-plot"), box = el.querySelector(".hs-tip");
  let chart = null, drawn = "";
  const draw = () => {
    const sort = state.sort === "given" && custom ? startSort : state.sort;
    const whole = !timed || (state.from <= years[0] && state.to >= years[years.length - 1]);
    const columns = whole ? options.columns : withinYears(options.columns, state.from, state.to);
    const shape = arrange(columns, { sort, grouping: state.grouping, bands: options.bands });
    if (!shape.length) {
      drawn = "";
      chart = null;
      plot.innerHTML = `<p class="hs-empty">Nothing in this span of years.</p>`;
      box.hidden = true;
      return;
    }
    const breaks = shape.filter((c, i) => i && c.bracket !== shape[i - 1].bracket).length;
    const fit = Math.floor((wrap.clientWidth - AX - PAD - breaks * GROUP_GAP) / shape.length) - GAP;
    const colWidth = options.colWidth ?? Math.max(minColWidth, Math.min(maxColWidth, fit));
    const sig = `${colWidth}|${state.sort}|${state.grouping}|${state.from}|${state.to}`;
    if (sig === drawn) return;
    drawn = sig;
    chart = buildChart({ ...options, columns, sort, grouping: state.grouping, colWidth });
    plot.innerHTML = `<div class="hs-yaxis">${chart.axisSvg}</div>${chart.plotSvg}`;   // the axis sticks when the plot scrolls sideways
    box.hidden = true;
  };
  // From can never pass To: moving one drags the other along
  const settle = (moved) => {
    if (!years.includes(state.from)) state.from = years[0];
    if (!years.includes(state.to)) state.to = years[years.length - 1];
    if (timed && state.from > state.to) state[moved === "from" ? "to" : "from"] = state[moved === "from" ? "from" : "to"];
    for (const s of el.querySelectorAll("[data-control]")) {
      const value = state[s.dataset.control];
      if (typeof value === "string") s.value = s.type === "range" ? years.indexOf(value) : value;
    }
    const track = el.querySelector(".hs-slider");
    if (!track) return;
    const at = (y) => `${(years.indexOf(y) / (years.length - 1)) * 100}%`;
    track.style.setProperty("--lo", at(state.from));
    track.style.setProperty("--hi", at(state.to));
    el.querySelector(".hs-span-text").textContent = state.from === state.to ? state.from : `${state.from} to ${state.to}`;
  };
  settle("from");
  draw();
  if (options.colWidth == null && typeof ResizeObserver !== "undefined") new ResizeObserver(draw).observe(wrap);
  const changed = (e) => {
    const name = e.target.dataset?.control;
    if (!name) return;
    state[name] = e.target.type === "range" ? years[Number(e.target.value)] : e.target.value;
    settle(name);
    draw();
  };
  // "input" follows a handle while it is dragged; "change" covers the menus
  el.querySelector(".hs-controls")?.addEventListener("input", changed);
  el.querySelector(".hs-controls")?.addEventListener("change", changed);

  const hide = () => (box.hidden = true);
  const show = (e) => {
    const target = e.target.closest?.("[data-tip]");
    const p = e.touches ? e.touches[0] : e;
    if (!target || !p || !chart) return hide();
    const t = chart.tips[Number(target.dataset.tip)];
    const r = wrap.getBoundingClientRect();
    const x = p.clientX - r.left + wrap.scrollLeft, yy = p.clientY - r.top;
    box.innerHTML =
      `<p class="hs-tip-series">${esc(t.series)}</p>` + t.lines.map(([k, v]) => `<p class="hs-tip-line"><span>${esc(k)}</span><b>${esc(v)}</b></p>`).join("");
    box.style.left = `${Math.max(0, Math.min(x + 14, chart.width - 220))}px`;
    box.style.top = `${Math.max(yy - 10, 0)}px`;
    box.hidden = false;
  };
  wrap.addEventListener("mousemove", show);
  wrap.addEventListener("touchstart", show, { passive: true });
  wrap.addEventListener("mouseleave", hide);
  return {
    get chart() { return chart; },
    /** Change the order, grouping or span of years from code: set({ sort: "median", grouping: "grouped", from: "2023", to: "2024" }). */
    set(next) {
      Object.assign(state, next);
      settle("to" in next ? "to" : "from");
      draw();
    },
  };
}
