import {
  IMAGE_LIMITS,
  dimensionCandidates,
  formatBytes,
  inspectImageBytes,
  outputFileName,
  parseTargetBytes,
  qualityCandidates,
  transparencySummary
} from "../lib/image-compression.js";

const fileInput = document.getElementById("image-file");
const fileError = document.getElementById("image-file-error");
const fileSummary = document.getElementById("image-file-summary");
const targetInput = document.getElementById("image-target");
const targetUnit = document.getElementById("image-target-unit");
const targetError = document.getElementById("image-target-error");
const compressButton = document.getElementById("compress-image");
const resetButton = document.getElementById("reset-image-compressor");
const result = document.getElementById("image-result");
const status = document.getElementById("image-status");
const live = document.getElementById("image-live");
const presetButtons = [...document.querySelectorAll("[data-image-target]")];
const totalOperationTimeoutMs = 30_000;

let outputUrl = null;
let busy = false;
let successfulResult = false;
let deepFileError = "";
let fileTouched = false;
let targetTouched = false;

function setSuccessfulResult(nextSuccessfulResult) {
  successfulResult = nextSuccessfulResult;
  compressButton.classList.toggle("button-primary", !successfulResult);
  compressButton.textContent = busy ? "Compressing…" : successfulResult ? "Compress again" : "Compress photo";
}

function clearOutputUrl() {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
}

function prepareResultSurface() {
  clearOutputUrl();
  setSuccessfulResult(false);
  result.hidden = false;
  result.replaceChildren();
  status.textContent = "";
  live.textContent = "";
}

function clearResult() {
  prepareResultSurface();
  const placeholder = document.createElement("div");
  placeholder.className = "image-result-placeholder";
  const kicker = document.createElement("p");
  kicker.className = "result-kicker";
  kicker.textContent = "Output";
  const heading = document.createElement("h2");
  heading.textContent = "Result";
  const description = document.createElement("p");
  description.textContent = "Choose a photo and size.";
  placeholder.append(kicker, heading, description);
  result.append(placeholder);
}

function setLive(message) {
  live.textContent = "";
  requestAnimationFrame(() => { live.textContent = message; });
}

function selectedFile() {
  return fileInput.files?.[0] ?? null;
}

function currentTarget() {
  return parseTargetBytes(targetInput.value, targetUnit.value);
}

function setInvalid(control, message) {
  if (message) control.setAttribute("aria-invalid", "true");
  else control.removeAttribute("aria-invalid");
}

function validateControls({ announce = false } = {}) {
  const file = selectedFile();
  const target = currentTarget();
  const fileProblem = !file ? "Choose one image." : file.size > IMAGE_LIMITS.maximumInputBytes ? "Choose an image no larger than 50 MB." : "";
  fileError.textContent = deepFileError || (fileTouched ? fileProblem : "");
  targetError.textContent = targetTouched && !target.ok ? target.error : "";
  setInvalid(fileInput, fileError.textContent);
  setInvalid(targetInput, targetError.textContent);
  compressButton.disabled = busy || Boolean(deepFileError) || Boolean(fileProblem) || !target.ok;
  if (announce && (fileError.textContent || targetError.textContent)) setLive(fileError.textContent || targetError.textContent);
  return { ok: !compressButton.disabled, file, target };
}

function setBusy(nextBusy) {
  busy = nextBusy;
  fileInput.disabled = nextBusy;
  targetInput.disabled = nextBusy;
  targetUnit.disabled = nextBusy;
  presetButtons.forEach((button) => { button.disabled = nextBusy; });
  resetButton.disabled = nextBusy;
  setSuccessfulResult(successfulResult);
  if (nextBusy) compressButton.disabled = true;
  else {
    const file = selectedFile();
    compressButton.disabled = !file || file.size > IMAGE_LIMITS.maximumInputBytes || !currentTarget().ok || fileInput.getAttribute("aria-invalid") === "true";
  }
}

function withTimeout(promise, timeoutMs, message) {
  if (timeoutMs <= 0) return Promise.reject(new Error(message));
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })
  ]);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("This browser could not encode the image locally."));
      else if (blob.type !== type) reject(new Error(`This browser cannot export ${type.replace("image/", "").toUpperCase()} locally. Try a current browser with same-format canvas export support.`));
      else resolve(blob);
    }, type, quality);
  });
}

async function decodeBitmap(file, timeoutMs) {
  let expired = false;
  const pending = createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
    if (expired) {
      bitmap.close();
      throw new Error("Image decoding took too long.");
    }
    return bitmap;
  });
  try {
    return await withTimeout(pending, timeoutMs, "Image decoding took too long.");
  } catch (error) {
    expired = true;
    throw error;
  }
}

function drawBitmap(bitmap, width, height, format) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: format !== "jpeg" });
  if (!context) throw new Error("The browser could not create an image workspace.");
  if (format === "jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

async function findCandidate(bitmap, inspection, target, deadline) {
  const sizes = dimensionCandidates(bitmap.width, bitmap.height);
  const qualities = qualityCandidates();
  for (const dimensions of sizes) {
    if (performance.now() >= deadline) throw new Error("Compression took too long. Try a larger target or a smaller image.");
    status.textContent = `Testing ${dimensions.width} × ${dimensions.height}…`;
    const canvas = drawBitmap(bitmap, dimensions.width, dimensions.height, inspection.format);
    if (inspection.format === "png") {
      const blob = await withTimeout(canvasBlob(canvas, inspection.mime), Math.min(8_000, deadline - performance.now()), "PNG encoding took too long. Try a smaller image.");
      if (blob.size <= target.operationalTargetBytes) return { blob, dimensions, quality: null };
      continue;
    }
    for (const quality of qualities) {
      if (performance.now() >= deadline) throw new Error("Compression took too long. Try a larger target or a smaller image.");
      const blob = await withTimeout(canvasBlob(canvas, inspection.mime, quality), Math.min(8_000, deadline - performance.now()), "Image encoding took too long. Try a smaller image.");
      if (blob.size <= target.operationalTargetBytes) return { blob, dimensions, quality };
    }
  }
  return null;
}

async function verifyCandidateOutput(candidate, inspection, file, deadline) {
  const downloadName = outputFileName(file.name, inspection.extension);
  const bytes = await withTimeout(candidate.blob.arrayBuffer(), Math.min(5_000, deadline - performance.now()), "Reading the encoded result took too long.");
  const outputInspection = inspectImageBytes(bytes, { name: downloadName, mime: candidate.blob.type });
  if (!outputInspection.ok) throw new Error("The browser produced an invalid or unsupported output image.");
  if (outputInspection.width !== candidate.dimensions.width || outputInspection.height !== candidate.dimensions.height) throw new Error("The encoded result dimensions did not match the measured result.");
  if (inspection.hasAlpha && !outputInspection.hasAlpha) throw new Error("This browser did not preserve the image alpha channel. No download was created.");
  return { ...candidate, outputInspection, downloadName };
}

function appendText(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  result.append(node);
  return node;
}

function createDetailsList(entries) {
  const list = document.createElement("dl");
  list.className = "result-details";
  for (const [term, description] of entries) {
    const row = document.createElement("div");
    row.className = "result-detail";
    const title = document.createElement("dt");
    title.textContent = term;
    const detail = document.createElement("dd");
    detail.textContent = description;
    row.append(title, detail);
    list.append(row);
  }
  return list;
}

function appendDetails(entries) {
  result.append(createDetailsList(entries));
}

function appendAdvancedDetails(entries) {
  const details = document.createElement("details");
  details.className = "result-more";
  const summary = document.createElement("summary");
  summary.textContent = "File details";
  details.append(summary, createDetailsList(entries));
  result.append(details);
}

function appendPreviewAndDownload(blob, outputInspection, label, downloadName) {
  outputUrl = URL.createObjectURL(blob);
  const preview = document.createElement("img");
  preview.className = "image-preview";
  preview.src = outputUrl;
  preview.alt = label === "Download original" ? "Preview of the unchanged selected image" : "Preview of the compressed image";
  const download = document.createElement("a");
  download.id = "download-image";
  download.className = "button button-primary";
  download.href = outputUrl;
  download.download = downloadName;
  download.dataset.outputBytes = String(blob.size);
  download.dataset.outputWidth = String(outputInspection.width);
  download.dataset.outputHeight = String(outputInspection.height);
  download.dataset.outputFormat = outputInspection.format;
  download.dataset.outputAlpha = String(outputInspection.hasAlpha);
  download.dataset.outputExif = String(outputInspection.hasExif);
  download.dataset.outputIcc = String(outputInspection.hasIcc);
  download.textContent = label;
  result.append(download, preview);
}

function renderResult({ file, inspection, target, bitmap, candidate, original }) {
  prepareResultSurface();
  const blob = original ? file : candidate.blob;
  const width = original ? bitmap.width : candidate.dimensions.width;
  const height = original ? bitmap.height : candidate.dimensions.height;
  const reduction = Math.max(0, (1 - blob.size / file.size) * 100);
  const heading = appendText("h2", original ? "Already under your limit" : "Compressed image ready");
  heading.tabIndex = -1;
  appendText("p", formatBytes(blob.size), "result-primary");

  if (original) {
    appendText("p", `Under ${formatBytes(target.hardCapBytes)} · original unchanged`);
    appendDetails([
      ["Dimensions", `${width} × ${height}`],
      ["Format", inspection.label]
    ]);
    appendPreviewAndDownload(blob, inspection, "Download original", file.name);
    appendAdvancedDetails([
      ["Color", `${inspection.colorModel}${inspection.hasIcc ? " · embedded ICC profile retained with the unchanged bytes" : " · no embedded ICC profile detected"}`],
      ["Exact bytes", blob.size.toLocaleString("en-US")],
      ["Metadata", "The original file is unchanged. Metadata is unchanged."]
    ]);
    setLive(`The original is already under the limit at ${formatBytes(blob.size)}.`);
  } else {
    const encoding = candidate.quality === null ? "PNG browser re-encode" : `Encoder quality ${Math.round(candidate.quality * 100)}%`;
    const outputInspection = candidate.outputInspection;
    const transparency = transparencySummary(inspection.format, inspection.hasAlpha, outputInspection.hasAlpha);
    const colorProfile = inspection.hasIcc
      ? outputInspection.hasIcc
        ? "An embedded ICC profile is present in both input and output; profile identity was not compared"
        : "The input ICC profile is absent from the output; the browser may convert displayed colors before export"
      : outputInspection.hasIcc ? "The browser export added an embedded ICC profile" : "No embedded ICC profile detected or copied";
    const metadata = outputInspection.hasExif
      ? "EXIF metadata is present in the inspected output; no metadata-removal claim is made"
      : "EXIF/GPS is absent from the inspected output; re-encoding may also remove XMP, IPTC, comments, text, gamma and chromaticity tags";
    appendText("p", `${formatBytes(file.size)} → ${formatBytes(blob.size)} · ${reduction.toFixed(1)}% smaller · under ${formatBytes(target.hardCapBytes)}`);
    appendDetails([
      ["Dimensions", `${bitmap.width} × ${bitmap.height} → ${width} × ${height}`],
      ["Format", `${inspection.label} · ${encoding}`]
    ]);
    appendPreviewAndDownload(blob, outputInspection, "Download compressed photo", candidate.downloadName);
    appendAdvancedDetails([
      ["Color model", inspection.colorModel === outputInspection.colorModel ? inspection.colorModel : `${inspection.colorModel} → ${outputInspection.colorModel}`],
      ["Transparency", transparency],
      ["Color profile", colorProfile],
      ["Exact bytes", `${blob.size.toLocaleString("en-US")} · operational target ${target.operationalTargetBytes.toLocaleString("en-US")}`],
      ["Metadata", `Re-encoded. ${metadata}.`],
      ["Orientation", inspection.exifOrientation
        ? `EXIF orientation ${inspection.exifOrientation} was applied by this browser's decoded bitmap and baked into pixels; the orientation tag is not copied`
        : "No EXIF orientation tag detected"]
    ]);
    setLive(`Compressed image ready at ${formatBytes(blob.size)}, under the selected limit.`);
  }

  setSuccessfulResult(true);
  result.hidden = false;
  status.textContent = "";
  heading.focus();
}

function renderProcessingError(message) {
  prepareResultSurface();
  const heading = appendText("h2", "Couldn’t compress this image");
  heading.tabIndex = -1;
  appendText("p", message, "field-error");
  result.hidden = false;
  setLive(message);
  heading.focus();
}

function imageInputError(message) {
  const error = new Error(message);
  error.imageInput = true;
  return error;
}

async function compress() {
  const state = validateControls({ announce: true });
  if (!state.ok) return;
  clearResult();
  fileError.textContent = "";
  setInvalid(fileInput, "");
  status.textContent = "Checking the image…";
  setBusy(true);
  const deadline = performance.now() + totalOperationTimeoutMs;

  let bitmap;
  try {
    if (typeof createImageBitmap !== "function") throw imageInputError("This browser cannot decode images locally with this tool. Use a current browser with image bitmap support.");
    const buffer = await withTimeout(state.file.arrayBuffer(), 10_000, "Reading this image took too long.");
    const inspection = inspectImageBytes(buffer, { name: state.file.name, mime: state.file.type });
    if (!inspection.ok) throw imageInputError(inspection.error);
    if (state.file.size > state.target.hardCapBytes && inspection.pixels > IMAGE_LIMITS.maximumEncodePixels) {
      throw imageInputError("Re-encoding is limited to 12 megapixels to control memory use. Choose a smaller image or a larger target that can return the unchanged original.");
    }

    try {
      bitmap = await decodeBitmap(state.file, Math.min(10_000, deadline - performance.now()));
    } catch (error) {
      throw imageInputError(error.message || "The browser could not decode this image.");
    }
    const decodedPixels = bitmap.width * bitmap.height;
    const dimensionsMatch = (bitmap.width === inspection.width && bitmap.height === inspection.height) ||
      (inspection.format === "jpeg" && bitmap.width === inspection.height && bitmap.height === inspection.width);
    if (!dimensionsMatch) throw imageInputError("Decoded dimensions do not match the validated image container.");
    if (!bitmap.width || !bitmap.height || decodedPixels > IMAGE_LIMITS.maximumPixels || bitmap.width > IMAGE_LIMITS.maximumAxis || bitmap.height > IMAGE_LIMITS.maximumAxis) throw imageInputError("Choose an image within the published pixel and dimension limits.");

    if (state.file.size <= state.target.hardCapBytes) {
      renderResult({ file: state.file, inspection, target: state.target, bitmap, candidate: null, original: true });
      return;
    }
    const foundCandidate = await findCandidate(bitmap, inspection, state.target, deadline);
    if (!foundCandidate) throw new Error("Couldn’t meet this limit within the default quality and 640 px size floor. Try a larger target.");
    if (foundCandidate.blob.size > state.target.operationalTargetBytes) throw new Error("The encoded file did not meet the measured target.");
    const candidate = await verifyCandidateOutput(foundCandidate, inspection, state.file, deadline);
    renderResult({ file: state.file, inspection, target: state.target, bitmap, candidate, original: false });
  } catch (error) {
    status.textContent = "";
    if (error.imageInput) {
      clearResult();
      deepFileError = error.message;
      fileError.textContent = deepFileError;
      setInvalid(fileInput, deepFileError);
      setLive(deepFileError);
      fileInput.focus();
    } else renderProcessingError(error.message || "The browser could not complete this image.");
  } finally {
    bitmap?.close();
    setBusy(false);
  }
}

function reset() {
  clearResult();
  fileInput.value = "";
  targetInput.value = "1";
  targetUnit.value = "MB";
  fileSummary.textContent = "No image selected.";
  deepFileError = "";
  fileTouched = false;
  targetTouched = false;
  fileError.textContent = "";
  targetError.textContent = "";
  setInvalid(fileInput, "");
  setInvalid(targetInput, "");
  presetButtons.forEach((button) => button.removeAttribute("aria-pressed"));
  presetButtons.find((button) => button.dataset.imageTarget === "1" && button.dataset.imageUnit === "MB")?.setAttribute("aria-pressed", "true");
  validateControls();
  fileInput.focus();
}

fileInput.addEventListener("change", () => {
  clearResult();
  deepFileError = "";
  fileTouched = true;
  const file = selectedFile();
  fileSummary.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "No image selected.";
  validateControls({ announce: Boolean(file) });
});

targetInput.addEventListener("input", () => {
  clearResult();
  targetTouched = true;
  presetButtons.forEach((button) => button.removeAttribute("aria-pressed"));
  validateControls();
});

targetUnit.addEventListener("change", () => {
  clearResult();
  targetTouched = true;
  presetButtons.forEach((button) => button.removeAttribute("aria-pressed"));
  validateControls();
});

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    clearResult();
    targetTouched = true;
    targetInput.value = button.dataset.imageTarget;
    targetUnit.value = button.dataset.imageUnit;
    presetButtons.forEach((entry) => entry.setAttribute("aria-pressed", String(entry === button)));
    validateControls();
  });
}

compressButton.addEventListener("click", compress);
resetButton.addEventListener("click", reset);
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) clearOutputUrl();
});

document.documentElement.dataset.toolReady = "true";
validateControls();
