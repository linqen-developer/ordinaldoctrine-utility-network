import {
  calculateAddSubtractDate,
  calculateAge,
  calculateBusinessDays,
  calculateDayOfWeek,
  calculateIsoWeek
} from "../lib/date-calculators.js";
import { formatNamedDate, plural } from "../lib/date-utils.js";
import { copyPlainText, markToolReady, resetCopyFeedback, setStatus } from "./shared-ui.js";

const surface = document.querySelector("[data-date-tool]");
const resultRegion = document.querySelector("#date-tool-result");
const copyButton = document.querySelector("#date-tool-copy");
const resetButton = document.querySelector("#date-tool-reset");
const status = document.querySelector("#date-tool-status");
const liveStatus = document.querySelector("#date-tool-live");
let currentCopy = "";
let hasInteracted = false;

function value(id) {
  return document.getElementById(id).value;
}

function checked(id) {
  return document.getElementById(id).checked;
}

function ageView() {
  const result = calculateAge(value("birth-date"), value("age-on-date"));
  if (!result.ok) return result;
  const headline = `${plural(result.years, "year")}, ${plural(result.months, "month")}, ${plural(result.days, "day")}`;
  const trace = `${formatNamedDate(result.birth)} → ${formatNamedDate(result.selected)}`;
  return {
    ...result,
    headline,
    summary: `Completed birthday-based age on ${formatNamedDate(result.selected)}.`,
    details: [["Completed years", plural(result.years, "year")], ["Remaining months", plural(result.months, "month")], ["Remaining days", plural(result.days, "day")]],
    trace,
    note: "Month-end birthdays use the last valid day when a target month is shorter.",
    copy: `${trace}\nAge: ${headline}.\nMonth-end birthdays are clamped to the last valid day.`
  };
}

function addSubtractView() {
  const result = calculateAddSubtractDate(value("start-date"), value("day-offset"));
  if (!result.ok) return result;
  const action = result.offset === 0 ? "No days added or subtracted." : `${plural(Math.abs(result.offset), "calendar day")} ${result.offset > 0 ? "added" : "subtracted"}.`;
  const trace = `${formatNamedDate(result.start)} ${result.offset >= 0 ? "+" : "−"} ${Math.abs(result.offset)} days`;
  return {
    ...result,
    headline: formatNamedDate(result.result),
    summary: action,
    details: [["ISO date", result.result], ["Signed offset", result.offset > 0 ? `+${result.offset}` : String(result.offset)]],
    trace,
    note: "Whole calendar days are added at UTC date boundaries; time zones and times of day are not used.",
    copy: `${trace}\nResult: ${formatNamedDate(result.result)} (${result.result}).`
  };
}

function businessDaysView() {
  const result = calculateBusinessDays(value("business-start-date"), value("business-end-date"), checked("business-include-start"), checked("business-include-end"));
  if (!result.ok) return result;
  const startRule = result.includeStart ? "included" : "excluded";
  const endRule = result.includeEnd ? "included" : "excluded";
  const direction = result.direction === "same" ? "The two dates are the same." : `The end date is ${result.direction} the start date.`;
  const trace = `${formatNamedDate(result.start)} → ${formatNamedDate(result.end)}`;
  return {
    ...result,
    headline: plural(result.businessDays, "business day"),
    summary: direction,
    details: [["Start date", startRule], ["End date", endRule]],
    trace,
    note: "Only Monday to Friday are counted. Public holidays and country-specific rules are not included.",
    copy: `${trace}\nBusiness days: ${result.businessDays}.\nStart date ${startRule}; end date ${endRule}.\nMonday–Friday only; public holidays are not included.`
  };
}

function isoWeekView() {
  const result = calculateIsoWeek(value("week-date"));
  if (!result.ok) return result;
  const weekLabel = `${result.weekYear}-W${String(result.week).padStart(2, "0")}`;
  return {
    ...result,
    headline: weekLabel,
    summary: `${formatNamedDate(result.date)} is in ISO week ${result.week} of ISO week-year ${result.weekYear}.`,
    details: [["ISO week-year", String(result.weekYear)], ["ISO week number", String(result.week)]],
    trace: formatNamedDate(result.date),
    note: "ISO weeks start on Monday. Week 1 is the week containing 4 January.",
    copy: `${formatNamedDate(result.date)} (${result.date})\nISO week: ${weekLabel}.`
  };
}

function weekdayView() {
  const result = calculateDayOfWeek(value("weekday-date"));
  if (!result.ok) return result;
  return {
    ...result,
    headline: result.weekday,
    summary: `${formatNamedDate(result.date)} falls on a ${result.weekday}.`,
    details: [["Weekday number", `${result.weekdayIndex} (Sunday = 0)`], ["Calendar", "Gregorian"]],
    trace: formatNamedDate(result.date),
    note: "The date is evaluated at UTC midnight, independent of the browser's local time zone.",
    copy: `${formatNamedDate(result.date)} (${result.date})\nDay of week: ${result.weekday}.`
  };
}

const configurations = {
  age: {
    inputIds: ["birth-date", "age-on-date"],
    errorIds: { birth: "birth-date", selected: "age-on-date" },
    empty: "Choose a date of birth and an age-on date to see the result.",
    heading: "Age on the selected date",
    calculate: ageView,
    reset() {}
  },
  "add-subtract-date": {
    inputIds: ["start-date", "day-offset"],
    errorIds: { start: "start-date", offset: "day-offset" },
    empty: "Choose a start date and enter a signed whole-day offset.",
    heading: "Resulting date",
    calculate: addSubtractView,
    reset() {}
  },
  "business-days": {
    inputIds: ["business-start-date", "business-end-date"],
    watchedIds: ["business-include-start", "business-include-end"],
    errorIds: { start: "business-start-date", end: "business-end-date" },
    empty: "Choose a start date and an end date to count business days.",
    heading: "Business-day count",
    calculate: businessDaysView,
    reset() { document.getElementById("business-include-start").checked = false; document.getElementById("business-include-end").checked = true; }
  },
  "week-number": {
    inputIds: ["week-date"],
    errorIds: { date: "week-date" },
    empty: "Choose a date to find its ISO week.",
    heading: "ISO week",
    calculate: isoWeekView,
    reset() {}
  },
  "day-of-week": {
    inputIds: ["weekday-date"],
    errorIds: { date: "weekday-date" },
    empty: "Choose a date to find its weekday.",
    heading: "Day of the week",
    calculate: weekdayView,
    reset() {}
  }
};

const configuration = configurations[surface?.dataset.dateTool];
if (!configuration) throw new Error("Unknown date tool configuration.");

function setFieldError(inputId, message = "") {
  const input = document.getElementById(inputId);
  document.getElementById(`${inputId}-error`).textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

function clearErrors() {
  for (const inputId of configuration.inputIds) setFieldError(inputId);
}

function renderEmpty(message) {
  currentCopy = "";
  copyButton.disabled = true;
  resultRegion.innerHTML = `<h2>${configuration.heading}</h2><p class="empty-result">${message}</p>`;
  liveStatus.textContent = message;
}

function render() {
  resetCopyFeedback(copyButton, status, "Copy result");
  if (!hasInteracted && configuration.inputIds.every((id) => value(id) === "")) {
    clearErrors();
    renderEmpty(configuration.empty);
    return;
  }

  const result = configuration.calculate();
  clearErrors();
  if (!result.ok) {
    for (const [key, message] of Object.entries(result.errors)) setFieldError(configuration.errorIds[key], message);
    renderEmpty("Correct the field marked above to see the result.");
    return;
  }

  currentCopy = result.copy;
  copyButton.disabled = false;
  const details = result.details.map(([term, description]) => `<div class="result-detail"><dt>${term}</dt><dd>${description}</dd></div>`).join("");
  resultRegion.innerHTML = `
    <h2>${configuration.heading}</h2>
    <p class="result-primary">${result.headline}</p>
    <p class="result-direction">${result.summary}</p>
    <dl class="result-details">${details}</dl>
    <p class="result-trace"><strong>${result.trace}</strong></p>
    <p class="result-note">${result.note}</p>`;
  liveStatus.textContent = `${result.headline}. ${result.summary}`;
}

for (const id of [...configuration.inputIds, ...(configuration.watchedIds ?? [])]) {
  document.getElementById(id).addEventListener("input", () => {
    hasInteracted = true;
    render();
  });
}

resetButton.addEventListener("click", () => {
  for (const inputId of configuration.inputIds) document.getElementById(inputId).value = "";
  configuration.reset();
  hasInteracted = false;
  render();
  document.getElementById(configuration.inputIds[0]).focus();
});

copyButton.addEventListener("click", async () => {
  if (!currentCopy) return;
  const copied = await copyPlainText(currentCopy);
  const message = copied ? "Result copied." : "Could not copy the result. Select and copy it manually.";
  copyButton.textContent = copied ? "Result copied" : "Copy result";
  setStatus(status, message, copied ? "success" : "error");
  liveStatus.textContent = message;
});

render();
markToolReady();
