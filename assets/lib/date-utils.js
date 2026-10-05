export const DAY_MS = 86_400_000;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function timestampFromParts(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

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
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, error: "Enter a valid calendar date." };
  }

  return {
    ok: true,
    value,
    year,
    month,
    day,
    timestamp: timestampFromParts(year, month, day)
  };
}

export function formatIsoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatNamedDate(value) {
  const parsed = typeof value === "string" ? parseIsoDate(value) : value;
  if (!parsed?.ok) return typeof value === "string" ? value : "";
  return `${parsed.day} ${MONTHS[parsed.month - 1]} ${parsed.year}`;
}

export function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export function utcPartsFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function shiftMonthsClamped(parsed, monthOffset) {
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + monthOffset;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  if (year < 1 || year > 9999) return null;
  const day = Math.min(parsed.day, daysInMonth(year, month));
  return {
    ok: true,
    value: formatIsoDate(year, month, day),
    year,
    month,
    day,
    timestamp: timestampFromParts(year, month, day)
  };
}
