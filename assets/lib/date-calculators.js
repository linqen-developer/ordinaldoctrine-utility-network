import {
  DAY_MS,
  formatIsoDate,
  parseIsoDate,
  shiftMonthsClamped,
  utcPartsFromTimestamp
} from "./date-utils.js";

const WHOLE_NUMBER = /^[+-]?\d+$/;
export const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

function dateErrors(entries) {
  const parsed = {};
  const errors = {};
  for (const [name, value] of Object.entries(entries)) {
    const result = parseIsoDate(value);
    if (result.ok) parsed[name] = result;
    else errors[name] = result.error;
  }
  return { parsed, errors };
}

export function calculateAge(birthValue, selectedValue) {
  const { parsed, errors } = dateErrors({ birth: birthValue, selected: selectedValue });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (selectedValue < birthValue) {
    return { ok: false, errors: { selected: "Choose a date on or after the date of birth." } };
  }

  let years = parsed.selected.year - parsed.birth.year;
  let yearAnchor = shiftMonthsClamped(parsed.birth, years * 12);
  if (yearAnchor.timestamp > parsed.selected.timestamp) {
    years -= 1;
    yearAnchor = shiftMonthsClamped(parsed.birth, years * 12);
  }

  let months = (parsed.selected.year - yearAnchor.year) * 12 + parsed.selected.month - yearAnchor.month;
  let monthAnchor = shiftMonthsClamped(parsed.birth, years * 12 + months);
  if (monthAnchor.timestamp > parsed.selected.timestamp) {
    months -= 1;
    monthAnchor = shiftMonthsClamped(parsed.birth, years * 12 + months);
  }

  return {
    ok: true,
    birth: birthValue,
    selected: selectedValue,
    years,
    months,
    days: (parsed.selected.timestamp - monthAnchor.timestamp) / DAY_MS,
    anchor: monthAnchor.value
  };
}

export function calculateAddSubtractDate(startValue, offsetValue) {
  const start = parseIsoDate(startValue);
  const errors = {};
  if (!start.ok) errors.start = start.error;

  let offset;
  if (typeof offsetValue !== "string" || !WHOLE_NUMBER.test(offsetValue)) {
    errors.offset = "Enter a signed whole number of days.";
  } else {
    offset = Number(offsetValue);
    if (!Number.isSafeInteger(offset)) errors.offset = "Enter a whole number within the supported range.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const resultTimestamp = start.timestamp + offset * DAY_MS;
  if (!Number.isSafeInteger(resultTimestamp) || !Number.isFinite(new Date(resultTimestamp).getTime())) {
    return { ok: false, errors: { offset: "That offset is outside the supported date range." } };
  }
  const parts = utcPartsFromTimestamp(resultTimestamp);
  if (parts.year < 1 || parts.year > 9999) {
    return { ok: false, errors: { offset: "That offset produces a date outside 0001-01-01 to 9999-12-31." } };
  }

  return {
    ok: true,
    start: startValue,
    offset,
    result: formatIsoDate(parts.year, parts.month, parts.day)
  };
}

function isWeekday(timestamp) {
  const day = new Date(timestamp).getUTCDay();
  return day >= 1 && day <= 5;
}

function weekdaysInclusive(firstTimestamp, lastTimestamp) {
  const totalDays = (lastTimestamp - firstTimestamp) / DAY_MS + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let count = fullWeeks * 5;
  const remaining = totalDays % 7;
  const firstDay = new Date(firstTimestamp).getUTCDay();
  for (let index = 0; index < remaining; index += 1) {
    const day = (firstDay + index) % 7;
    if (day >= 1 && day <= 5) count += 1;
  }
  return count;
}

export function calculateBusinessDays(startValue, endValue, includeStart = false, includeEnd = true) {
  const { parsed, errors } = dateErrors({ start: startValue, end: endValue });
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const sameDay = parsed.start.timestamp === parsed.end.timestamp;
  let businessDays;
  if (sameDay) {
    businessDays = isWeekday(parsed.start.timestamp) && (includeStart || includeEnd) ? 1 : 0;
  } else {
    const first = Math.min(parsed.start.timestamp, parsed.end.timestamp);
    const last = Math.max(parsed.start.timestamp, parsed.end.timestamp);
    businessDays = weekdaysInclusive(first, last);
    if (!includeStart && isWeekday(parsed.start.timestamp)) businessDays -= 1;
    if (!includeEnd && isWeekday(parsed.end.timestamp)) businessDays -= 1;
  }

  return {
    ok: true,
    start: startValue,
    end: endValue,
    includeStart: Boolean(includeStart),
    includeEnd: Boolean(includeEnd),
    direction: sameDay ? "same" : parsed.end.timestamp > parsed.start.timestamp ? "after" : "before",
    businessDays
  };
}

export function calculateIsoWeek(value) {
  const parsed = parseIsoDate(value);
  if (!parsed.ok) return { ok: false, errors: { date: parsed.error } };

  const isoDay = (new Date(parsed.timestamp).getUTCDay() + 6) % 7;
  const mondayTimestamp = parsed.timestamp - isoDay * DAY_MS;
  const thursdayParts = utcPartsFromTimestamp(mondayTimestamp + 3 * DAY_MS);
  const weekYear = thursdayParts.year;
  const january4 = parseIsoDate(`${String(weekYear).padStart(4, "0")}-01-04`);
  const january4IsoDay = (new Date(january4.timestamp).getUTCDay() + 6) % 7;
  const firstMonday = january4.timestamp - january4IsoDay * DAY_MS;
  const week = Math.floor((mondayTimestamp - firstMonday) / (7 * DAY_MS)) + 1;

  return { ok: true, date: value, weekYear, week };
}

export function calculateDayOfWeek(value) {
  const parsed = parseIsoDate(value);
  if (!parsed.ok) return { ok: false, errors: { date: parsed.error } };
  const weekdayIndex = new Date(parsed.timestamp).getUTCDay();
  return { ok: true, date: value, weekdayIndex, weekday: WEEKDAY_NAMES[weekdayIndex] };
}
