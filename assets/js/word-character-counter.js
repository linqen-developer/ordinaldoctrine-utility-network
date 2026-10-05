import { countText } from "../lib/text-count.js";
import { copyPlainText, markToolReady, resetCopyFeedback, setStatus } from "./shared-ui.js";

const textInput = document.querySelector("#counter-text");
const copyButton = document.querySelector("#copy-text");
const status = document.querySelector("#text-status");
const liveStatus = document.querySelector("#text-live");
const outputIds = {
  words: "count-words",
  characters: "count-characters",
  charactersExcludingWhitespace: "count-characters-no-space",
  lines: "count-lines",
  paragraphs: "count-paragraphs"
};

function render() {
  resetCopyFeedback(copyButton, status, "Copy text");
  const counts = countText(textInput.value);
  for (const [property, id] of Object.entries(outputIds)) {
    document.getElementById(id).textContent = String(counts[property]);
  }
  copyButton.disabled = textInput.value.length === 0;
  liveStatus.textContent = `${counts.words} words, ${counts.characters} characters, ${counts.lines} lines, ${counts.paragraphs} paragraphs.`;
}

textInput.addEventListener("input", render);

document.querySelector("#clear-text").addEventListener("click", () => {
  textInput.value = "";
  render();
  textInput.focus();
});

copyButton.addEventListener("click", async () => {
  if (!textInput.value) return;
  const copied = await copyPlainText(textInput.value);
  const message = copied ? "Text copied." : "Could not copy the text. Select and copy it manually.";
  copyButton.textContent = copied ? "Text copied" : "Copy text";
  setStatus(status, message, copied ? "success" : "error");
  liveStatus.textContent = message;
});

render();
markToolReady();
