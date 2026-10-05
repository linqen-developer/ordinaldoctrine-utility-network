const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function parseIsoDate(value) {
  if (typeof value !== "string") {
    return { ok: false, error: "Enter a valid calendar date." };
  }

  const match = ISO_DATE.exec(value);
  if (!match) {
    return { ok: false, error: "Enter a valid calendar date in YYYY-MM-DD format." };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, error: "Enter a valid calendar date." };
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, error: "Enter a valid calendar date." };
  }

  return {
    ok: true,
    value,
    year,
    month,
    day,
    timestamp: date.getTime()
  };
}

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

export function formatNamedDate(value) {
  const parsed = parseIsoDate(value);
  if (!parsed.ok) return value;
  return `${parsed.day} ${MONTHS[parsed.month - 1]} ${parsed.year}`;
}

export function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
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
