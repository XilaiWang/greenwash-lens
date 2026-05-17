const MAX_TEXT_LENGTH = 10000;

const SENTENCE_END = new Set([
  ".", "。", "！", "？", "!", "?", "…", "」", "）", ")", '"', "'", "”", "’",
]);

const MERGE_START = /^[\p{Lowercase_Letter}\p{Ideographic}0-9\-—–]/u;
const WORD_CHAR = /[\p{Lowercase_Letter}\p{Ideographic}0-9]/u;
const DASHES = new Set(["-", "—", "–"]);

function cleanPdfText(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return { cleanedText: "", document: [], warnings: [], stats: {} };
  }

  const originalLength = rawText.length;
  const warnings = [];

  let text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");

  const docBlocks = [];
  let paraLines = [];
  let tableBuffer = [];

  function flushPara() {
    if (!paraLines.length) return;
    const merged = mergeParagraph(paraLines);
    docBlocks.push({ type: "paragraph", text: merged });
    paraLines = [];
  }

  function flushTable() {
    if (!tableBuffer.length) return;
    docBlocks.push({ type: "table", rows: tableBuffer.slice() });
    tableBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || isOrphan(trimmed)) continue;

    if (isTableRow(trimmed)) {
      flushPara();
      tableBuffer.push(trimmed);
    } else {
      if (tableBuffer.length) flushTable();
      paraLines.push(trimmed);
    }
  }
  flushTable();
  flushPara();

  const document = docBlocks;

  const paraTexts = document
    .filter((b) => b.type === "paragraph")
    .map((b) => b.text);
  let cleanedText = paraTexts.join("\n\n");

  cleanedText = cleanedText
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "");

  if (cleanedText.length > MAX_TEXT_LENGTH) {
    cleanedText = cleanedText.slice(0, MAX_TEXT_LENGTH);
    const lastBreak = Math.max(
      cleanedText.lastIndexOf("\n"),
      cleanedText.lastIndexOf("。"),
      cleanedText.lastIndexOf("."),
      cleanedText.lastIndexOf(" "),
    );
    if (lastBreak > MAX_TEXT_LENGTH * 0.7) {
      cleanedText = cleanedText.slice(0, lastBreak + 1);
    }
    warnings.push(
      `PDF 文字较长（${originalLength} 字符），已截取前 ${cleanedText.length} 字符用于分析。`,
    );
  }

  cleanedText = cleanedText.trim();

  const tableCount = document.filter((b) => b.type === "table").length;
  if (tableCount > 0) {
    warnings.push(
      `检测到 ${tableCount} 处疑似表格内容，已在阅读器中保留但分析时自动排除。如需分析表格数据请手动粘贴。`,
    );
  }

  const removedLines =
    lines.length -
    paraTexts.reduce((sum, t) => sum + (t.match(/\n/g) || []).length + 1, 0) -
    document
      .filter((b) => b.type === "table")
      .reduce((sum, t) => sum + t.rows.length, 0);
  if (removedLines > 0) {
    warnings.push(`已清理 ${removedLines} 行孤立字符或碎片。`);
  }

  return {
    cleanedText,
    document,
    warnings,
    stats: {
      originalLength,
      cleanedLength: cleanedText.length,
      linesRemoved: removedLines,
      tableBlocksDetected: tableCount,
    },
  };
}

function mergeParagraph(lines) {
  const merged = [];
  for (const line of lines) {
    if (merged.length > 0 && shouldMerge(merged[merged.length - 1], line)) {
      merged.push(mergePair(merged.pop(), line));
    } else {
      merged.push(line);
    }
  }
  return merged.join("\n");
}

function isOrphan(trimmed) {
  return trimmed.length <= 2 && /^[\W\d_]+$/.test(trimmed);
}

function isTableRow(trimmed) {
  const spaces = (trimmed.match(/[ \t]{2,}/g) || []).length;
  if (spaces >= 3) return true;

  const whitespaceRatio =
    (trimmed.match(/[ \t]/g) || []).length / Math.max(1, trimmed.length);
  if (whitespaceRatio > 0.35 && spaces >= 2) return true;

  const digitRatio =
    (trimmed.match(/\d/g) || []).length / Math.max(1, trimmed.length);
  return digitRatio > 0.4 && spaces >= 1;
}

function shouldMerge(prevTrimmed, currTrimmed) {
  const lastChar = prevTrimmed[prevTrimmed.length - 1];
  if (DASHES.has(lastChar)) return true;
  if (SENTENCE_END.has(lastChar)) return false;
  return MERGE_START.test(currTrimmed[0]);
}

function mergePair(prev, current) {
  const lastChar = prev[prev.length - 1];

  if (DASHES.has(lastChar)) {
    return prev.slice(0, -1) + current;
  }

  if (WORD_CHAR.test(lastChar) && WORD_CHAR.test(current[0])) {
    return prev + current;
  }

  return prev + " " + current;
}

module.exports = {
  cleanPdfText,
  MAX_TEXT_LENGTH,
};
