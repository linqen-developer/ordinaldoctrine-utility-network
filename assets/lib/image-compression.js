export const IMAGE_LIMITS = Object.freeze({
  minimumTargetBytes: 10_000,
  maximumTargetBytes: 10_000_000,
  maximumInputBytes: 50_000_000,
  maximumPixels: 50_000_000,
  maximumEncodePixels: 12_000_000,
  maximumAxis: 16_384,
  maximumDecodedBytes: 200_000_000,
  defaultLongEdgeFloor: 640,
  operationalHeadroom: 0.995
});

const FORMAT_DETAILS = Object.freeze({
  jpeg: Object.freeze({ mime: "image/jpeg", extension: "jpg", label: "JPEG" }),
  png: Object.freeze({ mime: "image/png", extension: "png", label: "PNG" }),
  webp: Object.freeze({ mime: "image/webp", extension: "webp", label: "WebP" })
});

let crcTable;

function bytesView(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError("Expected an ArrayBuffer or Uint8Array.");
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function extensionOf(name) {
  const match = /\.([A-Za-z0-9]+)$/u.exec(name || "");
  return match ? match[1].toLowerCase() : "";
}

function formatFromExtension(extension) {
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "png") return "png";
  if (extension === "webp") return "webp";
  return null;
}

function formatFromMime(mime) {
  const value = (mime || "").toLowerCase();
  if (value === "image/jpeg" || value === "image/jpg") return "jpeg";
  if (value === "image/png") return "png";
  if (value === "image/webp") return "webp";
  return null;
}

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes, start, length) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = start; index < start + length; index += 1) crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint16(bytes, offset, littleEndian) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, littleEndian);
}

function readUint32(bytes, offset, littleEndian) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, littleEndian);
}

function parseExifOrientation(bytes, start, length) {
  if (length < 14 || ascii(bytes, start, 4) !== "Exif" || bytes[start + 4] !== 0 || bytes[start + 5] !== 0) return null;
  const tiff = start + 6;
  const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!littleEndian && !bigEndian) return null;
  if (readUint16(bytes, tiff + 2, littleEndian) !== 42) return null;
  const ifd = tiff + readUint32(bytes, tiff + 4, littleEndian);
  const end = start + length;
  if (ifd < tiff + 8 || ifd + 2 > end) return null;
  const count = readUint16(bytes, ifd, littleEndian);
  if (count > 4096 || ifd + 2 + count * 12 > end) return null;
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (readUint16(bytes, entry, littleEndian) !== 0x0112) continue;
    if (readUint16(bytes, entry + 2, littleEndian) !== 3 || readUint32(bytes, entry + 4, littleEndian) !== 1) return null;
    const orientation = readUint16(bytes, entry + 8, littleEndian);
    return orientation >= 1 && orientation <= 8 ? orientation : null;
  }
  return null;
}

function parseJpeg(bytes) {
  if (bytes.length < 23 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return { valid: false };

  const standalone = new Set([0x01, 0xd8, 0xd9, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let width = 0;
  let height = 0;
  let components = 0;
  let progressive = false;
  let hasExif = false;
  let hasIcc = false;
  let exifOrientation = null;
  let seenSof = false;
  let seenSos = false;
  let offset = 2;

  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return { valid: false };
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return { valid: false };
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00) return { valid: false };
    if (marker === 0xda) {
      if (!seenSof || offset + 2 > bytes.length - 2) return { valid: false };
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 6 || offset + length > bytes.length - 2) return { valid: false };
      seenSos = true;
      break;
    }
    if (standalone.has(marker)) continue;
    if (offset + 2 > bytes.length - 2) return { valid: false };
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) return { valid: false };
    const dataOffset = offset + 2;
    const dataLength = length - 2;
    if (marker === 0xe1 && dataLength >= 6 && ascii(bytes, dataOffset, 4) === "Exif" && bytes[dataOffset + 4] === 0 && bytes[dataOffset + 5] === 0) {
      hasExif = true;
      exifOrientation ??= parseExifOrientation(bytes, dataOffset, dataLength);
    } else if (marker === 0xe2 && dataLength >= 12 && ascii(bytes, dataOffset, 11) === "ICC_PROFILE" && bytes[dataOffset + 11] === 0) {
      hasIcc = true;
    }
    if (sofMarkers.has(marker)) {
      if (length < 8 || seenSof) return { valid: false };
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      components = bytes[offset + 7];
      progressive = marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce;
      if (!width || !height || !components || length !== 8 + components * 3) return { valid: false };
      seenSof = true;
    }
    offset += length;
  }

  return { valid: seenSof && seenSos, animated: false, width, height, components, progressive, hasAlpha: false, hasExif, hasIcc, exifOrientation };
}

function parsePng(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 57 || !signature.every((value, index) => bytes[index] === value)) return { valid: false };

  let offset = 8;
  let first = true;
  let seenHeader = false;
  let seenData = false;
  let seenEnd = false;
  let animated = false;
  let hasAlpha = false;
  let hasExif = false;
  let hasIcc = false;
  let colorType = null;
  let bitDepth = null;
  let width = 0;
  let height = 0;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return { valid: false };
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
    const dataOffset = offset + 8;
    const end = offset + 12 + length;
    if (end < offset || end > bytes.length) return { valid: false };
    const type = ascii(bytes, offset + 4, 4);
    const expectedCrc = new DataView(bytes.buffer, bytes.byteOffset + dataOffset + length, 4).getUint32(0, false);
    if (crc32(bytes, offset + 4, 4 + length) !== expectedCrc) return { valid: false };
    if (first && type !== "IHDR") return { valid: false };
    first = false;

    if (type === "IHDR") {
      if (seenHeader || length !== 13) return { valid: false };
      width = new DataView(bytes.buffer, bytes.byteOffset + dataOffset, 4).getUint32(0, false);
      height = new DataView(bytes.buffer, bytes.byteOffset + dataOffset + 4, 4).getUint32(0, false);
      bitDepth = bytes[dataOffset + 8];
      colorType = bytes[dataOffset + 9];
      hasAlpha = colorType === 4 || colorType === 6;
      const compression = bytes[dataOffset + 10];
      const filter = bytes[dataOffset + 11];
      const interlace = bytes[dataOffset + 12];
      if (!width || !height || compression !== 0 || filter !== 0 || interlace > 1) return { valid: false };
      seenHeader = true;
    } else if (type === "IDAT") {
      if (!seenHeader || seenEnd || length === 0) return { valid: false };
      seenData = true;
    } else if (type === "acTL") animated = true;
    else if (type === "tRNS") hasAlpha = true;
    else if (type === "iCCP") hasIcc = true;
    else if (type === "eXIf") hasExif = true;
    else if (type === "IEND") {
      if (length !== 0 || !seenHeader || !seenData || end !== bytes.length) return { valid: false };
      seenEnd = true;
    }
    offset = end;
  }

  return { valid: seenHeader && seenData && seenEnd, animated, width, height, hasAlpha, hasExif, hasIcc, colorType, bitDepth, exifOrientation: null };
}

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function parseWebp(bytes) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return { valid: false };
  const declaredSize = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true) + 8;
  if (declaredSize !== bytes.length) return { valid: false };

  let offset = 12;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let frameWidth = 0;
  let frameHeight = 0;
  let seenFrame = false;
  let animated = false;
  let hasAlpha = false;
  let hasExif = false;
  let hasIcc = false;

  while (offset < declaredSize) {
    if (offset + 8 > declaredSize) return { valid: false };
    const type = ascii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const dataOffset = offset + 8;
    const end = dataOffset + size + (size % 2);
    if (end < offset || end > declaredSize) return { valid: false };

    if (type === "VP8X") {
      if (size !== 10 || canvasWidth || canvasHeight) return { valid: false };
      hasIcc ||= Boolean(bytes[dataOffset] & 0x20);
      hasAlpha ||= Boolean(bytes[dataOffset] & 0x10);
      hasExif ||= Boolean(bytes[dataOffset] & 0x08);
      animated ||= Boolean(bytes[dataOffset] & 0x02);
      canvasWidth = uint24le(bytes, dataOffset + 4) + 1;
      canvasHeight = uint24le(bytes, dataOffset + 7) + 1;
    } else if (type === "VP8 ") {
      if (seenFrame || size < 10 || bytes[dataOffset + 3] !== 0x9d || bytes[dataOffset + 4] !== 0x01 || bytes[dataOffset + 5] !== 0x2a) return { valid: false };
      frameWidth = ((bytes[dataOffset + 7] << 8) | bytes[dataOffset + 6]) & 0x3fff;
      frameHeight = ((bytes[dataOffset + 9] << 8) | bytes[dataOffset + 8]) & 0x3fff;
      seenFrame = frameWidth > 0 && frameHeight > 0;
    } else if (type === "VP8L") {
      if (seenFrame || size < 5 || bytes[dataOffset] !== 0x2f) return { valid: false };
      const bits = new DataView(bytes.buffer, bytes.byteOffset + dataOffset + 1, 4).getUint32(0, true);
      frameWidth = (bits & 0x3fff) + 1;
      frameHeight = ((bits >>> 14) & 0x3fff) + 1;
      hasAlpha ||= Boolean(bits & 0x10000000);
      seenFrame = true;
    } else if (type === "ANIM" || type === "ANMF") animated = true;
    else if (type === "ALPH") hasAlpha = true;
    else if (type === "ICCP") hasIcc = true;
    else if (type === "EXIF") hasExif = true;
    offset = end;
  }

  const width = canvasWidth || frameWidth;
  const height = canvasHeight || frameHeight;
  if (animated && canvasWidth && canvasHeight) return { valid: true, animated: true, width, height, hasAlpha, hasExif, hasIcc, exifOrientation: null };
  if (!seenFrame || !width || !height) return { valid: false };
  if (canvasWidth && (frameWidth > canvasWidth || frameHeight > canvasHeight)) return { valid: false };
  return { valid: true, animated, width, height, hasAlpha, hasExif, hasIcc, exifOrientation: null };
}

function inspectContainer(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { format: "jpeg", ...parseJpeg(bytes) };
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return { format: "png", ...parsePng(bytes) };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { format: "webp", ...parseWebp(bytes) };
  return { format: null, valid: false };
}

function resourceError(width, height) {
  if (width > IMAGE_LIMITS.maximumAxis || height > IMAGE_LIMITS.maximumAxis) return "Choose an image no wider or taller than 16,384 pixels.";
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > IMAGE_LIMITS.maximumPixels || pixels * 4 > IMAGE_LIMITS.maximumDecodedBytes) {
    return "Choose an image no larger than 50 megapixels or 200 MB when decoded.";
  }
  return null;
}

export function inspectImageBytes(input, { name = "", mime = "" } = {}) {
  const bytes = bytesView(input);
  const container = inspectContainer(bytes);
  if (!container.format) return { ok: false, error: "Choose a static JPEG, PNG or WebP image." };
  if (!container.valid) return { ok: false, error: "The image container is incomplete or corrupt." };
  if (container.animated) return { ok: false, error: "Animated images are not supported. Choose a static JPEG, PNG or WebP image." };

  const extensionFormat = formatFromExtension(extensionOf(name));
  if (!extensionFormat) return { ok: false, error: "The file name must end in .jpg, .jpeg, .png or .webp." };
  if (extensionFormat !== container.format) return { ok: false, error: "The file extension does not match the image data." };
  const mimeFormat = mime ? formatFromMime(mime) : container.format;
  if (!mimeFormat) return { ok: false, error: "The browser-reported file type is not supported." };
  if (mimeFormat !== container.format) return { ok: false, error: "The browser-reported file type does not match the image data." };

  const error = resourceError(container.width, container.height);
  if (error) return { ok: false, error };
  return {
    ok: true,
    format: container.format,
    ...FORMAT_DETAILS[container.format],
    animated: false,
    width: container.width,
    height: container.height,
    pixels: container.width * container.height,
    hasAlpha: Boolean(container.hasAlpha),
    hasExif: Boolean(container.hasExif),
    hasIcc: Boolean(container.hasIcc),
    exifOrientation: container.exifOrientation ?? null,
    progressive: Boolean(container.progressive),
    colorModel: container.format === "jpeg"
      ? container.components === 4 ? "CMYK/YCCK" : container.components === 3 ? "RGB/YCbCr" : `${container.components}-component JPEG`
      : container.format === "png" ? `PNG color type ${container.colorType}` : "WebP"
  };
}

export function parseTargetBytes(rawValue, unit) {
  const raw = String(rawValue ?? "");
  const value = raw.trim();
  if (raw !== value || !/^(?:\d+|\d*\.\d+)$/u.test(value)) return { ok: false, error: "Enter a positive target using ordinary decimal digits." };
  const number = Number(value);
  const multiplier = unit === "KB" ? 1_000 : unit === "MB" ? 1_000_000 : null;
  if (!multiplier || !Number.isFinite(number) || number <= 0) return { ok: false, error: "Choose KB or MB and enter a positive target." };
  const hardCapBytes = Math.floor(number * multiplier);
  if (hardCapBytes < IMAGE_LIMITS.minimumTargetBytes || hardCapBytes > IMAGE_LIMITS.maximumTargetBytes) return { ok: false, error: "Choose a target from 10 KB through 10 MB." };
  return { ok: true, hardCapBytes, operationalTargetBytes: Math.floor(hardCapBytes * IMAGE_LIMITS.operationalHeadroom), value: number, unit };
}

export function qualityCandidates({ maximum = 0.92, minimum = 0.7, step = 0.02 } = {}) {
  if (!(maximum <= 1 && minimum >= 0 && maximum >= minimum && step > 0)) throw new RangeError("Invalid quality range.");
  const values = [];
  for (let value = maximum; value >= minimum - Number.EPSILON; value -= step) values.push(Number(Math.max(minimum, value).toFixed(2)));
  return [...new Set(values)];
}

export function dimensionCandidates(width, height, { ratio = 0.9, longEdgeFloor = IMAGE_LIMITS.defaultLongEdgeFloor } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError("Image dimensions must be positive integers.");
  if (!(ratio > 0 && ratio < 1) || !Number.isInteger(longEdgeFloor) || longEdgeFloor < 1) throw new RangeError("Invalid resize policy.");
  const originalLongEdge = Math.max(width, height);
  const output = [{ width, height, scale: 1 }];
  if (originalLongEdge <= longEdgeFloor) return output;
  let longEdge = originalLongEdge;
  while (longEdge > longEdgeFloor) {
    const nextLongEdge = Math.max(longEdgeFloor, Math.floor(longEdge * ratio));
    if (nextLongEdge === longEdge) break;
    const scale = nextLongEdge / originalLongEdge;
    output.push({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale });
    longEdge = nextLongEdge;
  }
  return output;
}

export function transparencySummary(inputFormat, inputHasAlpha, outputHasAlpha) {
  if (inputFormat === "jpeg") return "Not applicable to JPEG";
  if (inputHasAlpha && outputHasAlpha) return "Input and output contain an alpha channel; transparent-pixel behavior is covered in the verified browser corpus";
  if (inputHasAlpha && !outputHasAlpha) return "The input alpha channel is absent from the output";
  if (!inputHasAlpha && outputHasAlpha) return "Input had no alpha channel; output has an alpha channel. Pixel opacity was not compared at runtime";
  return "No alpha channel in input or output";
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError("Bytes must be a non-negative finite number.");
  if (bytes < 1_000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes < 100_000 ? 1 : 0)} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 2 : 1)} MB`;
}

export function outputFileName(originalName, extension) {
  const safeExtension = String(extension).replace(/[^a-z0-9]/giu, "").toLowerCase() || "jpg";
  const base = String(originalName || "image")
    .replace(/\.[^.]+$/u, "")
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "image";
  return `${base}-compressed.${safeExtension}`;
}
