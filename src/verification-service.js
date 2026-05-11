const ALLOWED_EVIDENCE_STATUS = new Set([
  "supported",
  "contradicted",
  "insufficient",
  "unknown",
]);

const TAG_KEYWORDS = {
  quantified: ["量化", "指标", "数字", "quant", "metric", "%"],
  evidence: ["证据", "认证", "审计", "第三方", "evidence", "verified", "audit"],
  promise: ["承诺", "未来", "2030", "2050", "promise", "future", "target"],
  absolute: ["绝对", "碳中和", "净零", "zero", "neutral", "net zero"],
  scope: ["范围", "边界", "基准", "scope", "baseline"],
  action: ["行动", "实施", "完成", "reduced", "implemented", "completed"],
};

function buildVerification({ text, classification, result, llm }) {
  const checks = [];
  const localTags = deriveTagsFromLocal(result);
  const llmTags = deriveTagsFromLlm(llm);

  checks.push(classificationCheck("context", classification.context));
  checks.push(classificationCheck("sector", classification.sector));
  checks.push(ruleConfidenceCheck(result));
  checks.push(llmConfigCheck(llm));

  if (llm && llm.enabled) {
    checks.push(llmSchemaCheck(llm));
    checks.push(llmRiskGapCheck(llm, result));
    checks.push(llmTagOverlapCheck(localTags, llmTags));
  }

  if (llm && llm.error) {
    checks.push({
      id: "llm_error",
      status: "warn",
      title: "外部模型调用失败",
      message: "已自动回退到本地规则结果。",
    });
  }

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

function classificationCheck(kind, part) {
  const lowConfidence = part.detected.confidence < 0.55;
  const manualOverride = part.source === "manual";
  const title = kind === "context" ? "文本场景识别" : "行业识别";

  if (manualOverride) {
    return {
      id: `${kind}_manual_override`,
      status: "pass",
      title,
      message: "当前结果使用了人工覆盖，不依赖自动识别。",
    };
  }

  if (lowConfidence) {
    return {
      id: `${kind}_low_confidence`,
      status: "warn",
      title,
      message: `自动识别置信度偏低（${percent(part.detected.confidence)}），建议人工复核。`,
    };
  }

  return {
    id: `${kind}_confidence`,
    status: "pass",
    title,
    message: `自动识别置信度正常（${percent(part.detected.confidence)}）。`,
  };
}

function ruleConfidenceCheck(result) {
  if (result.confidence < 55) {
    return {
      id: "rule_confidence_low",
      status: "warn",
      title: "本地规则置信度",
      message: "本地规则引擎对当前文本的把握一般，建议结合人工判断。",
    };
  }

  return {
    id: "rule_confidence_ok",
    status: "pass",
    title: "本地规则置信度",
    message: `本地规则引擎置信度为 ${Math.round(result.confidence)}%。`,
  };
}

function llmConfigCheck(llm) {
  if (!llm || !llm.enabled) {
    return {
      id: "llm_disabled",
      status: "warn",
      title: "外部模型增强",
      message: "外部模型未启用或未返回结果，当前展示的是本地规则结果。",
    };
  }

  return {
    id: "llm_enabled",
    status: "pass",
    title: "外部模型增强",
    message: `已启用 ${llm.provider} · ${llm.model}。`,
  };
}

function llmSchemaCheck(llm) {
  const status = ALLOWED_EVIDENCE_STATUS.has(llm.evidenceStatus) ? "pass" : "fail";

  return {
    id: "llm_schema",
    status,
    title: "外部模型结构校验",
    message:
      status === "pass"
        ? "外部模型返回了可解析的结构化结果。"
        : "外部模型结果结构异常，建议忽略该增强判断。",
  };
}

function llmRiskGapCheck(llm, result) {
  if (!Number.isFinite(llm.adjustedRisk)) {
    return {
      id: "llm_risk_missing",
      status: "warn",
      title: "外部模型风险分",
      message: "外部模型没有返回可用风险分，已保留本地规则分数。",
    };
  }

  const gap = Math.abs(llm.adjustedRisk - result.risk);
  return {
    id: "llm_risk_gap",
    status: gap > 25 ? "warn" : "pass",
    title: "外部模型一致性",
    message:
      gap > 25
        ? `外部模型与本地规则分差较大（${gap} 分），建议人工复核。`
        : `外部模型与本地规则分差可接受（${gap} 分）。`,
  };
}

function llmTagOverlapCheck(localTags, llmTags) {
  const overlap = [...localTags].filter((tag) => llmTags.has(tag));

  return {
    id: "llm_tag_overlap",
    status: overlap.length ? "pass" : "warn",
    title: "外部模型信号重合度",
    message: overlap.length
      ? `外部模型与本地规则在 ${overlap.join("、")} 上存在重合。`
      : "外部模型结论与本地规则信号重合较少，建议谨慎采信。",
  };
}

function deriveTagsFromLocal(result) {
  const tags = new Set();

  if (!result.evidence.quantified) tags.add("quantified");
  if (!result.evidence.proof) tags.add("evidence");
  if (!result.evidence.scope) tags.add("scope");
  if (result.components.promise > 0) tags.add("promise");
  if (result.components.overclaim > 0) tags.add("absolute");
  if (!result.evidence.action) tags.add("action");

  return tags;
}

function deriveTagsFromLlm(llm) {
  const text = [llm?.summary || "", ...(llm?.annotations || [])].join(" ").toLowerCase();
  const tags = new Set();

  Object.entries(TAG_KEYWORDS).forEach(([tag, keywords]) => {
    if (keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      tags.add(tag);
    }
  });

  return tags;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

module.exports = {
  buildVerification,
};
