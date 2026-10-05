export const LENGTH_UNITS = Object.freeze({
  mm: { id: "mm", name: "millimetre", plural: "millimetres", symbol: "mm", metres: 0.001 },
  cm: { id: "cm", name: "centimetre", plural: "centimetres", symbol: "cm", metres: 0.01 },
  m: { id: "m", name: "metre", plural: "metres", symbol: "m", metres: 1 },
  km: { id: "km", name: "kilometre", plural: "kilometres", symbol: "km", metres: 1000 },
  in: { id: "in", name: "inch", plural: "inches", symbol: "in", metres: 0.0254 },
  ft: { id: "ft", name: "foot", plural: "feet", symbol: "ft", metres: 0.3048 },
  yd: { id: "yd", name: "yard", plural: "yards", symbol: "yd", metres: 0.9144 },
  mi: { id: "mi", name: "international mile", plural: "international miles", symbol: "mi", metres: 1609.344 }
});

const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseDecimalNumber(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, code: "empty", error: "Enter a value to convert." };
  }
  if (!DECIMAL_NUMBER.test(value)) {
    return {
      ok: false,
      code: "format",
      error: "Use digits and one decimal point only. Exponents and separators are not accepted."
    };
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return { ok: false, code: "range", error: "Enter a finite number within the supported range." };
  }
  if (number === 0 && /[1-9]/.test(value)) {
    return { ok: false, code: "range", error: "This value is too small for a reliable conversion." };
  }
  return { ok: true, value: number };
}

export function convertLength(value, fromId, toId) {
  const from = LENGTH_UNITS[fromId];
  const to = LENGTH_UNITS[toId];
  if (!from || !to) {
    return { ok: false, error: "Choose supported from and to units." };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "Enter a finite number within the supported range." };
  }

  const result = (value * from.metres) / to.metres;
  if (!Number.isFinite(result)) {
    return { ok: false, error: "The converted result is outside the supported range." };
  }
  if (result === 0 && value !== 0) {
    return { ok: false, error: "The converted result is too small to represent reliably." };
  }

  return { ok: true, value: result, from, to };
}

export function formatSignificant(value, precision = 6) {
  const digits = Number(precision);
  if (!Number.isInteger(digits) || digits < 1 || digits > 15 || !Number.isFinite(value)) return "";
  if (Object.is(value, -0) || value === 0) return "0";

  const raw = value.toPrecision(digits);
  if (raw.includes("e")) {
    return raw
      .replace(/(\.\d*?[1-9])0+e/u, "$1e")
      .replace(/\.0+e/u, "e")
      .replace("e+", "e");
  }
  return raw.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

export function unitNameForQuantity(unitOrId, quantity) {
  const unit = typeof unitOrId === "string" ? LENGTH_UNITS[unitOrId] : unitOrId;
  if (!unit || typeof quantity !== "number" || !Number.isFinite(quantity)) return "";
  return Math.abs(quantity) === 1 ? unit.name : unit.plural;
}

export function conversionBasis(fromId, toId) {
  const from = LENGTH_UNITS[fromId];
  const to = LENGTH_UNITS[toId];
  if (!from || !to) return "";
  const factor = from.metres / to.metres;
  const formattedFactor = formatSignificant(factor, 15);
  return `1 ${unitNameForQuantity(from, 1)} (${from.symbol}) = ${formattedFactor} ${unitNameForQuantity(to, Number(formattedFactor))} (${to.symbol})`;
}
