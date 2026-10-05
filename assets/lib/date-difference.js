import { DAY_MS, formatNamedDate, parseIsoDate, plural } from "./date-utils.js";

export { formatNamedDate, parseIsoDate, plural } from "./date-utils.js";

export function calculateDateDifference(startValue, endValue, includeStart = false) {
  const start = parseIsoDate(startValue);
  const end = parseIsoDate(endValue);
  const errors = {};

  if (!start.ok) errors.start = start.error;
  if (!end.ok) errors.end = end.error;
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const signedDays = (end.timestamp - start.timestamp) / DAY_MS;
  const absoluteDays = Math.abs(signedDays);
  const countedDays = absoluteDays + (includeStart ? 1 : 0);

  return {
    ok: true,
    direction: signedDays === 0 ? "same" : signedDays > 0 ? "after" : "before",
    signedDays,
    absoluteDays,
    countedDays,
    weeks: Math.floor(absoluteDays / 7),
    remainingDays: absoluteDays % 7,
    start: start.value,
    end: end.value,
    includeStart: Boolean(includeStart)
  };
}

export function describeDateDifference(result) {
  if (!result?.ok) return "";
  if (result.direction === "same") return "The two dates are the same.";
  return `The end date is ${plural(result.absoluteDays, "day")} ${result.direction} the start date.`;
}

export function formatDateCopy(result) {
  if (!result?.ok) return "";
  const start = formatNamedDate(result.start);
  const end = formatNamedDate(result.end);
  const countRule = result.includeStart
    ? `Start date counted as day 1: ${plural(result.countedDays, "counted day")}.`
    : "Start date not counted.";
  return [
    `${start} → ${end}`,
    `Difference: ${plural(result.absoluteDays, "calendar day")}.`,
    describeDateDifference(result),
    countRule
  ].join("\n");
}
