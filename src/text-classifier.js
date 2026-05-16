const {
  CONTEXT_LABELS,
  SECTOR_LABELS,
  VALID_CONTEXT_TYPES,
  VALID_SECTORS,
  contextSignals,
  sectorSignals,
} = require("./shared/classification-constants");

function classifyText(text, overrides = {}) {
  const clean = String(text || "").trim();
  const language = detectLanguage(clean);
  const contextDetection = detectBySignals(clean, contextSignals, "marketing");
  const sectorDetection = detectBySignals(clean, sectorSignals, "general");
  const contextChoice = normalizeChoice(overrides.contextType, contextDetection.value, CONTEXT_LABELS);
  const sectorChoice = normalizeChoice(overrides.sector, sectorDetection.value, SECTOR_LABELS);

  return {
    language,
    context: {
      detected: contextDetection,
      selected: contextChoice.value,
      source: contextChoice.source,
      label: CONTEXT_LABELS[contextChoice.value],
    },
    sector: {
      detected: sectorDetection,
      selected: sectorChoice.value,
      source: sectorChoice.source,
      label: SECTOR_LABELS[sectorChoice.value],
    },
  };
}

function detectLanguage(text) {
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  const total = cjkCount + latinCount;

  if (!total) {
    return { value: "unknown", label: "未知", confidence: 0 };
  }

  if (cjkCount > 0 && latinCount > 0) {
    const ratio = Math.min(cjkCount, latinCount) / total;
    if (ratio > 0.12) {
      return { value: "mixed", label: "中英混合", confidence: roundConfidence(0.64 + ratio) };
    }
  }

  if (cjkCount >= latinCount) {
    return {
      value: "zh",
      label: "中文",
      confidence: roundConfidence(cjkCount / total),
    };
  }

  return {
    value: "en",
    label: "英文",
    confidence: roundConfidence(latinCount / total),
  };
}

function detectBySignals(text, signalMap, fallback) {
  const lower = text.toLowerCase();
  const scored = Object.entries(signalMap)
    .map(([value, terms]) => {
      const matches = terms.filter((term) => lower.includes(term.toLowerCase()));
      return {
        value,
        label: value,
        score: matches.length,
        confidence: 0,
        matches: matches.slice(0, 6),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (!best || best.score === 0) {
    return {
      value: fallback,
      label: fallback,
      confidence: 0.38,
      matches: [],
    };
  }

  return {
    ...best,
    confidence: roundConfidence(Math.min(0.92, 0.52 + best.score * 0.12)),
  };
}

function normalizeChoice(value, detectedValue, labels) {
  if (!value || value === "auto" || !labels[value]) {
    return {
      value: detectedValue,
      source: "keyword",
    };
  }

  return {
    value,
    source: "manual",
  };
}

function roundConfidence(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

module.exports = {
  CONTEXT_LABELS,
  SECTOR_LABELS,
  VALID_CONTEXT_TYPES,
  VALID_SECTORS,
  classifyText,
};
