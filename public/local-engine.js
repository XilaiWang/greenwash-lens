(function attachGreenwashLocal(global) {
  const core = global.GreenwashEngineCore;

  if (!core) {
    throw new Error("GreenwashEngineCore is required before local-engine.js");
  }

  const STORAGE_KEY = "greenwash-local-history-v2";
  const ENGINE_VERSION = "browser-local-0.9.0";

  const cc = global.GreenwashClassificationConstants;
  if (!cc) {
    throw new Error("GreenwashClassificationConstants is required before local-engine.js");
  }
  const {
    CONTEXT_LABELS,
    SECTOR_LABELS,
    contextSignals,
    sectorSignals,
  } = cc;

  function analyze(input) {
    const text = String(input.text || "").trim();

    if (!text) {
      throw new Error("请提供需要分析的文本。");
    }

    const classification = classifyText(text, input);
    const result = core.scoreText(text, {
      contextType: classification.context.selected,
      sector: classification.sector.selected,
      classification,
    });
    result.emotionAnalysis = {
      finalScore: Math.round(((result.components?.emotional || 0) / 30) * 100),
      level: "none",
      consistency: 0,
      layersUsed: 1,
      breakdown: {
        rule: Math.round(((result.components?.emotional || 0) / 30) * 100),
        nlp: null,
        llm: null,
      },
      nlpDetail: null,
    };
    result.emotionAnalysis.level =
      result.emotionAnalysis.finalScore >= 71
        ? "high"
        : result.emotionAnalysis.finalScore >= 46
          ? "medium"
          : result.emotionAnalysis.finalScore >= 21
            ? "low"
            : "none";
    const llm = {
      enabled: false,
      provider: "none",
      model: null,
      summary: "当前使用浏览器本地引擎。未连接外部模型与后端服务。",
      annotations: ["这是离线本地分析结果，可用于快速筛查。"],
      vagueExplanations: [],
      contradictions: [],
      credibilityNotes: [],
      rewriteSuggestion: null,
      error: null,
    };
    const verification = buildVerification({
      classification,
      result,
      llm,
    });
    const meta = {
      app: "greenwash-lens",
      apiVersion: "local",
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      llmService: {
        provider: "none",
        enabled: false,
        model: null,
        mode: "browser-local",
        missing: ["backend", "external-llm"],
      },
      nlpService: {
        available: false,
        url: null,
      },
    };
    const historyItem = createHistoryItem({
      text,
      contextType: classification.context.selected,
      sector: classification.sector.selected,
      result,
      llm,
      verification,
      classification,
      meta,
    });

    addHistoryItem(historyItem);

    return {
      result,
      classification,
      llm,
      verification,
      meta,
      historyItem,
    };
  }

  function health() {
    return {
      ok: true,
      app: "greenwash-lens",
      apiVersion: "local",
      engineVersion: ENGINE_VERSION,
      llmService: {
        provider: "none",
        enabled: false,
        model: null,
        mode: "browser-local",
      },
      nlpService: {
        available: false,
        url: null,
      },
    };
  }

  function loadHistory() {
    return readHistory();
  }

  function clearHistory() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return [];
  }

  function addHistoryItem(item) {
    const items = [item].concat(readHistory()).slice(0, 500);

    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }

  function readHistory() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function createHistoryItem(data) {
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      request: {
        text: data.text,
        contextType: data.contextType,
        sector: data.sector,
      },
      result: data.result,
      llm: data.llm,
      verification: data.verification,
      classification: data.classification,
      meta: data.meta,
    };
  }

  function classifyText(text, overrides) {
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
      return { value: "zh", label: "中文", confidence: roundConfidence(cjkCount / total) };
    }

    return { value: "en", label: "英文", confidence: roundConfidence(latinCount / total) };
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

  function buildVerification(payload) {
    const checks = [];

    checks.push(classificationCheck("文本场景识别", payload.classification.context));
    checks.push(classificationCheck("行业识别", payload.classification.sector));
    checks.push(
      payload.result.confidence < 55
        ? {
            id: "rule_confidence_low",
            status: "warn",
            title: "本地规则置信度",
            message: "本地规则对当前文本的把握一般，建议结合原文复核。",
          }
        : {
            id: "rule_confidence_ok",
            status: "pass",
            title: "本地规则置信度",
            message: `本地规则引擎置信度为 ${Math.round(payload.result.confidence)}%。`,
          },
    );
    checks.push({
      id: "llm_disabled",
      status: "warn",
      title: "外部模型增强",
      message: "当前处于浏览器本地模式，没有调用外部模型和服务端接口。",
    });

    const overall = checks.some((item) => item.status === "fail")
      ? "fail"
      : checks.some((item) => item.status === "warn")
        ? "warn"
        : "pass";

    return {
      overall,
      checks,
      generatedAt: new Date().toISOString(),
    };
  }

  function classificationCheck(title, part) {
    if (part.source === "manual") {
      return {
        id: `${title}-manual`,
        status: "pass",
        title,
        message: "当前结果使用了人工覆盖，不依赖自动识别。",
      };
    }

    if (part.detected.confidence < 0.55) {
      return {
        id: `${title}-low`,
        status: "warn",
        title,
        message: `自动识别置信度偏低（${Math.round(part.detected.confidence * 100)}%），建议人工复核。`,
      };
    }

    return {
      id: `${title}-ok`,
      status: "pass",
      title,
      message: `自动识别置信度正常（${Math.round(part.detected.confidence * 100)}%）。`,
    };
  }

  function deleteHistoryItem(id) {
    const nextItems = loadHistory().filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
    return nextItems;
  }

  global.GreenwashLocal = {
    analyze,
    health,
    loadHistory,
    clearHistory,
    deleteHistoryItem,
  };
})(window);
