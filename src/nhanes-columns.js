/**
 * NHANES adults (data/nhanes-blood-pressure.json) sliced the way public-health tables usually are. Each value is
 * one examined adult's systolic blood pressure in mm Hg (the mean of the readings taken at the exam).
 * An adult sits in several columns: one age group, one sex, and, where measured, one body-mass and one income group.
 *
 * Time: the survey runs in two-year cycles, so each value is dated to the first year of its cycle.
 */
export const PRESSURE_BANDS = [
  [0, 100, "Under 100"],
  [100, 110, "100–110"],
  [110, 120, "110–120"],
  [120, 130, "120–130"],
  [130, 140, "130–140"],
  [140, 160, "140–160"],
  [160, 180, "160–180"],
  [180, Infinity, "180 and up"],
];

export const mmHg = (v) => `${Math.round(v)} mm Hg`;

/** Cut points, in one place so the page footnote and the code cannot drift apart. */
export const CUTS = { age: [40, 60], bmi: [25, 30], poverty: 1, comfortable: 4 };

export function nhanesColumns(set) {
  const people = set.rows.map(([systolic, cycle, age, sex, bmi10, ratio100]) => ({
    v: systolic,
    date: `${set.cycles[cycle].slice(0, 4)}-01-01`,
    age,
    sex,
    bmi: bmi10 == null ? null : bmi10 / 10,
    ratio: ratio100 == null ? null : ratio100 / 100,
  }));
  const column = (key, label, group, test) => ({ key, label, group, values: people.filter(test).map((p) => ({ v: p.v, date: p.date })) });
  const [a1, a2] = CUTS.age, [b1, b2] = CUTS.bmi;
  return [
    column("all", "All adults", undefined, () => true),
    column("age-young", `Age 18 to ${a1 - 1}`, "Age", (p) => p.age < a1),
    column("age-middle", `Age ${a1} to ${a2 - 1}`, "Age", (p) => p.age >= a1 && p.age < a2),
    column("age-older", `Age ${a2} and over`, "Age", (p) => p.age >= a2),
    column("men", "Men", "Sex", (p) => p.sex === 1),
    column("women", "Women", "Sex", (p) => p.sex === 2),
    column("bmi-low", `BMI under ${b1}`, "Body mass", (p) => p.bmi != null && p.bmi < b1),
    column("bmi-mid", `BMI ${b1} to ${b2}`, "Body mass", (p) => p.bmi != null && p.bmi >= b1 && p.bmi < b2),
    column("bmi-high", `BMI ${b2} and over`, "Body mass", (p) => p.bmi != null && p.bmi >= b2),
    column("income-low", "Below poverty line", "Family income", (p) => p.ratio != null && p.ratio < CUTS.poverty),
    column("income-high", `${CUTS.comfortable}x poverty line or more`, "Family income", (p) => p.ratio != null && p.ratio >= CUTS.comfortable),
  ];
}
