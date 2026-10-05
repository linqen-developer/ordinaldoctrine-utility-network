const FALLBACK_WORD = /(?:[\p{L}\p{N}]\p{M}*)+(?:['’\-‐‑‒–—](?:[\p{L}\p{N}]\p{M}*)+)*/gu;

function segmentWords(text) {
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let count = 0;
  for (const part of segmenter.segment(text)) {
    if (part.isWordLike) count += 1;
  }
  return count;
}

export function countWordsFallback(text) {
  return text.match(FALLBACK_WORD)?.length ?? 0;
}

export function countGraphemesFallback(text) {
  return Array.from(text).length;
}

function segmentGraphemes(text) {
  return Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text));
}

export function countText(text, options = {}) {
  const value = String(text ?? "");
  const useWordSegmenter = options.wordMode !== "fallback" && typeof Intl?.Segmenter === "function";
  const useGraphemeSegmenter = options.graphemeMode !== "fallback" && typeof Intl?.Segmenter === "function";

  const graphemes = useGraphemeSegmenter ? segmentGraphemes(value) : Array.from(value);
  const characters = graphemes.length;
  const charactersExcludingWhitespace = graphemes.reduce(
    (total, segment) => total + (/^\s+$/u.test(segment.segment ?? segment) ? 0 : 1),
    0
  );

  const normalized = value.replace(/\r\n?/g, "\n");
  const lines = value.length === 0 ? 0 : normalized.split("\n").length;
  const paragraphs = normalized.trim().length === 0
    ? 0
    : normalized.trim().split(/\n\s*\n+/u).filter((part) => part.trim().length > 0).length;

  return {
    words: useWordSegmenter ? segmentWords(value) : countWordsFallback(value),
    characters,
    charactersExcludingWhitespace,
    lines,
    paragraphs,
    wordMethod: useWordSegmenter ? "segmenter" : "fallback",
    characterMethod: useGraphemeSegmenter ? "grapheme" : "code-point"
  };
}
