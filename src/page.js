// The demonstration page: four charts, each loaded and drawn on its own so one failure cannot blank the rest.
import { mountChart } from "./histostick.js";
import { secColumns } from "./sec-columns.js";
import { SEC_ROWS, SEC_SAMPLE } from "./sec-data.js";
import { dummyColumns, CHANGE_BANDS, percent } from "./dummy-columns.js";
import { nvdaColumns, MOVE_BANDS, RULES } from "./nvda-columns.js";
import { nhanesColumns, PRESSURE_BANDS, mmHg } from "./nhanes-columns.js";

/** Loads a data file from this folder (a relative address, never another site). */
async function load(file) {
  const response = await fetch(file);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  return response.json();
}

/** Draws one chart and its footnote; on any failure says so in that chart's place and carries on. */
async function chart(id, draw) {
  const place = document.getElementById(id), note = document.getElementById(`${id}-note`);
  try {
    note.textContent = await draw(place);
  } catch (error) {
    console.error(error);
    place.replaceChildren(Object.assign(document.createElement("p"), { className: "failed", textContent: "This chart could not be loaded." }));
    note.textContent = "";
  }
}

// a sample of SEC respondents, by office
chart("by-office", (place) => {
  mountChart(place, {
    title: "Money per respondent, by SEC office",
    seriesName: "SEC office",
    columns: secColumns(SEC_ROWS).byOffice,
    groupName: "Regions",
  });
  return (
    `A sample: ${SEC_SAMPLE.rows} respondents, 1 in ${SEC_SAMPLE.every} of the ${SEC_SAMPLE.ofMoneyRows.toLocaleString("en-US")} with money on file as of ${SEC_SAMPLE.asOf}. ` +
    `Money counted once per respondent; amounts deemed satisfied elsewhere excluded.`
  );
});

// made up: the same chart on a different kind of number, with the columns grouped
chart("by-city", async (place) => {
  const dummy = await load("data/dummy-home-prices.json");
  mountChart(place, {
    title: "Price change in a year, homes with a 2 in the address, by city",
    seriesName: "City",
    columns: dummyColumns(dummy),
    bands: CHANGE_BANDS,
    scale: "linear",
    format: percent,
    unit: "Homes",
    bandNoun: "price-change band",
    valueNoun: "change",
    showTotal: false,
    bandRange: false,
    groupName: "Regions",
    grouping: "grouped",
  });
  return `Fictional. ${dummy.note} ${dummy.rows.length} invented homes, with invented sale dates.`;
});

// one axis mixing calendar categories, company events and numeric ones (volume, the day before).
// Bar width is the share of each column, because "all days" is about 60 times the size of "ex-dividend day".
chart("by-day", async (place) => {
  const nvda = await load("data/nvda-moves.json");
  mountChart(place, {
    title: "NVDA daily move, by the kind of day",
    seriesName: "Kind of day",
    columns: nvdaColumns(nvda),
    bands: MOVE_BANDS,
    scale: "linear",
    format: percent,
    unit: "Trading days",
    bandNoun: "band",
    valueNoun: "daily move",
    widthBy: "share",
    showTotal: false,
    bandRange: false,
    groupName: "Kinds",
    grouping: "grouped",
  });
  return (
    `NVDA daily moves, ${nvda.rows[0][0]} to ${nvda.rows[nvda.rows.length - 1][0]}: each day's close against the one before, worked out from daily prices published by Yahoo Finance. ` +
    `The prices themselves are not included. An illustration, not a record: earnings dates are approximate. ` +
    `High volume: ${RULES.highVolume}x the average of the prior ${RULES.volumeWindow} sessions or more; low volume: ${RULES.lowVolume}x or less. ` +
    `Week after earnings: the ${RULES.earningsSessions} sessions after a results release. A day can sit in more than one column.`
  );
});

// public health: a national examination survey, sliced by age, sex, body mass and family income
chart("by-group", async (place) => {
  const nhanes = await load("data/nhanes-blood-pressure.json");
  mountChart(place, {
    title: "Systolic blood pressure of US adults, by group",
    seriesName: "Group",
    columns: nhanesColumns(nhanes),
    bands: PRESSURE_BANDS,
    scale: "linear",
    format: mmHg,
    unit: "Adults",
    bandNoun: "band (mm Hg)",
    valueNoun: "reading",
    widthBy: "share",
    showTotal: false,
    bandRange: false,
    groupName: "Kinds",
    grouping: "grouped",
  });
  return (
    `NHANES (CDC, National Center for Health Statistics), survey cycles ${nhanes.cycles[0]} to ${nhanes.cycles[nhanes.cycles.length - 1]}: ` +
    `${nhanes.rows.length.toLocaleString("en-US")} examined adults, each reading the mean of those taken at the exam. ` +
    `Counts of examined people, not national estimates: sampling weights are not applied. ` +
    `BMI and income groups leave out adults without that measure; income is family income against the poverty line. ` +
    `Years are the first year of each two-year cycle.`
  );
});
