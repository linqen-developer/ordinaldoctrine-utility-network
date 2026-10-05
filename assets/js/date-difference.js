import {
  calculateDateDifference,
  describeDateDifference,
  formatDateCopy,
  formatNamedDate,
  plural
} from "../lib/date-difference.js";
import { copyPlainText, markToolReady, resetCopyFeedback, setStatus } from "./shared-ui.js";

const startInput = document.querySelector("#start-date");
const endInput = document.querySelector("#end-date");
const includeStart = document.querySelector("#include-start");
const startError = document.querySelector("#start-error");
const endError = document.querySelector("#end-error");
const resultRegion = document.querySelector("#date-result");
const copyButton = document.querySelector("#copy-date-result");
const status = document.querySelector("#date-status");
const liveStatus = document.querySelector("#date-live");
let currentResult = null;

function setFieldError(input, errorElement, message = "") {
  errorElement.textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

function renderEmpty(message) {
  currentResult = null;
  copyButton.disabled = true;
  resultRegion.innerHTML = `<h2>Difference between the dates</h2><p class="empty-result">${message}</p>`;
  liveStatus.textContent = message;
}

function render() {
  resetCopyFeedback(copyButton, status, "Copy result");
  const startValue = startInput.value;
  const endValue = endInput.value;

  if (!startValue && !endValue) {
    setFieldError(startInput, startError);
    setFieldError(endInput, endError);
    renderEmpty("Choose a start date and an end date to see the result.");
    return;
  }

  if (!startValue || !endValue) {
    setFieldError(startInput, startError, startValue ? "" : "Choose a start date.");
    setFieldError(endInput, endError, endValue ? "" : "Choose an end date.");
    renderEmpty(startValue ? "Choose an end date to see the result." : "Choose a start date to see the result.");
    return;
  }

  const result = calculateDateDifference(startValue, endValue, includeStart.checked);
  if (!result.ok) {
    setFieldError(startInput, startError, result.errors.start ?? "");
    setFieldError(endInput, endError, result.errors.end ?? "");
    renderEmpty("Correct the date marked above to see the result.");
    return;
  }

  setFieldError(startInput, startError);
  setFieldError(endInput, endError);
  currentResult = result;
  copyButton.disabled = false;

  const breakdown = `${plural(result.weeks, "week")} and ${plural(result.remainingDays, "day")}`;
  const countRule = result.includeStart
    ? `Start date counted as day 1: ${plural(result.countedDays, "counted day")}`
    : "Start date not counted";

  resultRegion.innerHTML = `
    <h2>Difference between the dates</h2>
    <p class="result-primary">${plural(result.absoluteDays, "day")}</p>
    <p class="result-direction">${describeDateDifference(result)}</p>
    <dl class="result-details">
      <div class="result-detail"><dt>Weeks and days</dt><dd>${breakdown}</dd></div>
      <div class="result-detail"><dt>Count rule</dt><dd>${countRule}</dd></div>
    </dl>
    <p class="result-trace"><strong>${formatNamedDate(result.start)}</strong> → <strong>${formatNamedDate(result.end)}</strong></p>
    <p class="result-note">Calendar dates only. Time of day and time zone are not used.</p>`;
  liveStatus.textContent = `${plural(result.absoluteDays, "day")}. ${describeDateDifference(result)} ${countRule}.`;
}

for (const element of [startInput, endInput, includeStart]) {
  element.addEventListener("input", render);
}

document.querySelector("#swap-dates").addEventListener("click", () => {
  const previousStart = startInput.value;
  startInput.value = endInput.value;
  endInput.value = previousStart;
  render();
});

function reset() {
  startInput.value = "";
  endInput.value = "";
  includeStart.checked = false;
  render();
  startInput.focus();
}

document.querySelector("#reset-dates-result").addEventListener("click", reset);

copyButton.addEventListener("click", async () => {
  if (!currentResult) return;
  const copied = await copyPlainText(formatDateCopy(currentResult));
  const message = copied ? "Result copied." : "Could not copy the result. Select and copy it manually.";
  copyButton.textContent = copied ? "Result copied" : "Copy result";
  setStatus(status, message, copied ? "success" : "error");
  liveStatus.textContent = message;
});

render();
markToolReady();
