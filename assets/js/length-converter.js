import {
  LENGTH_UNITS,
  conversionBasis,
  convertLength,
  formatSignificant,
  parseDecimalNumber
} from "../lib/length-converter.js";
import { copyPlainText, markToolReady, resetCopyFeedback, setStatus } from "./shared-ui.js";

const valueInput = document.querySelector("#length-value");
const fromSelect = document.querySelector("#from-unit");
const toSelect = document.querySelector("#to-unit");
const precisionSelect = document.querySelector("#precision");
const valueError = document.querySelector("#length-error");
const resultRegion = document.querySelector("#length-result");
const copyButton = document.querySelector("#copy-length-result");
const status = document.querySelector("#length-status");
const liveStatus = document.querySelector("#length-live");
let currentCopy = "";

function renderEmpty(message) {
  currentCopy = "";
  copyButton.disabled = true;
  resultRegion.innerHTML = `<h2 class="sr-only">Result</h2><p class="empty-result">${message}</p>`;
  liveStatus.textContent = message;
}

function render() {
  resetCopyFeedback(copyButton, status, "Copy result");
  const parsed = parseDecimalNumber(valueInput.value);
  if (!parsed.ok) {
    const isEmpty = parsed.code === "empty";
    valueError.textContent = isEmpty ? "" : parsed.error;
    valueInput.setAttribute("aria-invalid", isEmpty ? "false" : "true");
    renderEmpty(isEmpty ? "Enter a value to see the conversion." : "Correct the value marked above to see the result.");
    return;
  }

  const converted = convertLength(parsed.value, fromSelect.value, toSelect.value);
  if (!converted.ok) {
    valueError.textContent = converted.error;
    valueInput.setAttribute("aria-invalid", "true");
    renderEmpty("Correct the value marked above to see the result.");
    return;
  }

  valueError.textContent = "";
  valueInput.setAttribute("aria-invalid", "false");
  const precision = Number(precisionSelect.value);
  const formatted = formatSignificant(converted.value, precision);
  const inputFormatted = valueInput.value;
  const basis = conversionBasis(fromSelect.value, toSelect.value);
  currentCopy = `${inputFormatted} ${converted.from.symbol} = ${formatted} ${converted.to.symbol}\n${basis}\nDisplayed with ${precision} significant digits.`;
  copyButton.disabled = false;
  resultRegion.innerHTML = `
    <h2 class="sr-only">Result</h2>
    <p class="result-primary">${formatted} <span class="result-unit">${converted.to.symbol}</span></p>
    <p class="result-direction">${inputFormatted} ${converted.from.symbol} → ${formatted} ${converted.to.symbol}</p>
    <p class="basis">${basis} · ${precision} significant digits</p>`;
  liveStatus.textContent = `${inputFormatted} ${converted.from.symbol} equals ${formatted} ${converted.to.symbol}.`;
}

for (const element of [valueInput, fromSelect, toSelect, precisionSelect]) {
  element.addEventListener("input", render);
}

document.querySelector("#swap-units").addEventListener("click", () => {
  const previousFrom = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = previousFrom;
  render();
});

document.querySelector("#reset-length").addEventListener("click", () => {
  valueInput.value = "";
  fromSelect.value = "m";
  toSelect.value = "ft";
  precisionSelect.value = "6";
  render();
  valueInput.focus();
});

copyButton.addEventListener("click", async () => {
  if (!currentCopy) return;
  const copied = await copyPlainText(currentCopy);
  const message = copied ? "Result copied." : "Could not copy the result. Select and copy it manually.";
  copyButton.textContent = copied ? "Result copied" : "Copy result";
  setStatus(status, message, copied ? "success" : "error");
  liveStatus.textContent = message;
});

for (const unit of Object.values(LENGTH_UNITS)) {
  for (const select of [fromSelect, toSelect]) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = `${unit.name[0].toUpperCase()}${unit.name.slice(1)} (${unit.symbol})`;
    select.append(option);
  }
}
fromSelect.value = "m";
toSelect.value = "ft";
render();
markToolReady();
