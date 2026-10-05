export async function copyPlainText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue to the local selection fallback.
    }
  }

  const temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.setAttribute("readonly", "");
  temporary.style.position = "fixed";
  temporary.style.opacity = "0";
  document.body.append(temporary);
  temporary.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  temporary.remove();
  return copied;
}

export function setStatus(element, message, state = "success") {
  element.textContent = message;
  element.dataset.state = state;
}

export function resetCopyFeedback(button, status, defaultLabel) {
  button.textContent = defaultLabel;
  setStatus(status, "", "success");
}

export function markToolReady() {
  document.documentElement.dataset.toolReady = "true";
  window.dispatchEvent(new Event("ordinal-tool-ready"));
}
