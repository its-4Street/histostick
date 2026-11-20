/**
 * NVDA daily moves (data/nvda-moves.json) sliced by the kind of day. Each value is one session's move: its close
 * against the previous close, in percent. A session can sit in several columns.
 *
 * The file holds moves only, worked out from published daily prices; the prices and volumes themselves are not in
 * it. It is an illustration of what the chart can do, not a record to rely on.
 *
 * The columns mix kinds of category on purpose: calendar (Tuesdays, month end, after a holiday), company events
 * (the week after earnings, ex-dividend days), and numeric ones (volume against its own recent average, the size
 * of the previous day's move).
 */
export const MOVE_BANDS = [
  [-Infinity, -5, "Below -5%"],
  [-5, -3, "-5% to -3%"],
  [-3, -1, "-3% to -1%"],
  [-1, 0, "-1% to 0%"],
  [0, 1, "0% to +1%"],
  [1, 3, "+1% to +3%"],
  [3, 5, "+3% to +5%"],
  [5, Infinity, "+5% and up"],
];

/** The rules behind the columns, in one place so the page footnote and the code cannot drift apart. */
export const RULES = { volumeWindow: 20, highVolume: 1.5, lowVolume: 0.7, bigMove: 3, earningsSessions: 5 };

/** What each bit of a row's `flags` number means. */
export const FLAGS = { monthEnd: 1, afterHoliday: 2, afterEarnings: 4, exDividend: 8 };

/** A row is [date, move in percent, volume against the prior sessions' average (or null), flags]. */
export function nvdaColumns(set) {
  const sessions = set.rows.map(([date, v, volumeRatio, flags], i, rows) => ({
    date,
    v,
    volumeRatio,
    flags,
    weekday: new Date(date + "T00:00:00Z").getUTCDay(),
    previousMove: i ? rows[i - 1][1] : null,
  }));
  const column = (key, label, group, test) => ({ key, label, group, values: sessions.filter(test).map((s) => ({ v: s.v, date: s.date })) });
  const has = (bit) => (s) => (s.flags & bit) !== 0;
  return [
    column("all", "All days", undefined, () => true),
    column("tuesday", "Tuesdays", "Calendar", (s) => s.weekday === 2),
    column("month-end", "Month end", "Calendar", has(FLAGS.monthEnd)),
    column("after-holiday", "After a holiday", "Calendar", has(FLAGS.afterHoliday)),
    column("after-earnings", "Week after earnings", "Company", has(FLAGS.afterEarnings)),
    column("ex-dividend", "Ex-dividend day", "Company", has(FLAGS.exDividend)),
    column("high-volume", "High volume", "Volume", (s) => s.volumeRatio != null && s.volumeRatio >= RULES.highVolume),
    column("low-volume", "Low volume", "Volume", (s) => s.volumeRatio != null && s.volumeRatio <= RULES.lowVolume),
    column("after-drop", `After -${RULES.bigMove}% or worse`, "Day before", (s) => s.previousMove != null && s.previousMove <= -RULES.bigMove),
    column("after-gain", `After +${RULES.bigMove}% or better`, "Day before", (s) => s.previousMove != null && s.previousMove >= RULES.bigMove),
  ];
}
