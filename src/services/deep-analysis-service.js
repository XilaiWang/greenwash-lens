const { getServiceStatus, callProvider } = require("./llm-service");
const llmCache = require("./llm-cache");

function buildDeepPrompt(text) {
  return `You are a professional ESG greenwashing risk analyst. Analyze the provided text using the framework below. Return ONLY valid JSON — no explanation outside the JSON.

## Framework

### GATE-1: ESG detection
Is this text about environment, climate, emissions, energy, sustainability, ESG, green products, social responsibility, or governance? If no, set is_esg=false and stop.

### GATE-2: Claim direction
- positive_claim: emphasizes achievements, green attributes, vision, or commitments
- balanced_disclosure: includes challenges, shortcomings, boundaries, or uncertainties
- mixed: both positive and disclosing content

### GATE-3: Text types (multiple allowed)
- P: product/service green claims or marketing
- D: ESG report, fund disclosure, sustainability report
- C: net-zero, carbon neutral, future goals, vision commitments
- S: social responsibility / employer branding / governance

### GATE-4: Extract every ESG-related claim unit (sentence or clause-level).
For each claim, classify:
- claim_type: "产品属性" | "绩效披露" | "未来承诺" | "价值观表述" | "其他"
- level: 4=已实施行动(has results/quantification/verification), 3=有路径计划(has time+measures+resources), 2=模糊意向(direction without time+quantification+measures), 1=愿望性表述(values/attitude only, no action elements)
- specificity: "low" | "medium" | "high"
- support_signals: list from ["数值/单位", "时间点/范围", "边界/范围", "方法/标准", "第三方认证/审计", "可核验行动"]
- risk_flags: list from ["模糊词", "绝对化表述", "缺少量化", "缺少时间", "缺少边界", "营销语气", "情绪号召"]

### M3: Vagueness (0-100)
Identify vague words that create positive green impressions without clear definition:
Chinese vague words: 环保, 绿色, 生态, 可持续, 天然, 清洁, 低碳, 零碳, 环境友好, 生态友好, 对地球友好, 负责任, 有机(无认证时), 无害, 更绿色, 更可持续, 引领变革, 绿色未来, 美好家园, 守护地球, 积极推进, 持续优化, 创新脱碳方案
English vague words: eco-friendly, green, sustainable, natural, clean, low-carbon, carbon-neutral, net-zero, climate-friendly, planet-friendly, responsible, environmentally conscious, biodegradable, greener, cleaner future, sustainability-led, nature positive

Also identify specificity markers: numbers+units, time points/baseline year, scope/boundary, methodology/standards, third-party certification/audit, verifiable actions.

Calculate:
- vague_words_count
- specific_markers_count
- vagueness_ratio = vague_words_count / max(vague_words_count + specific_markers_count, 1)
- vagueness_density = vague_words_count / max(total_tokens, 1)
- M3 = (vagueness_ratio * 0.65 + min(vagueness_density * 10, 1) * 0.35) * 100

### M4: Promotional Framing (0-100)
Positive packaging signals: superlatives, absolutes (100%, zero-impact, completely), self-praising ESG narratives, emotional appeals (for future generations, save the planet), values without constraints, marketing tone in disclosure documents.
Balance signals: admitting challenges/gaps, providing qualifications, stating boundaries/scope, mentioning negative changes/costs, noting uncertainties/method limitations.

- positive_signals_count
- balance_signals_count
- positivity_score = (positive_signals_count - balance_signals_count) / max(positive_signals_count + balance_signals_count, 1)
- M4 = ((positivity_score + 1) / 2) * 100

### M5: Commitment-to-Action Gap (0-100)
For each claim, assign level 1-4. Then calculate:
- average_level
- level1_share (proportion at level 1)
- level2_share (proportion at level 2)
- worst_level (lowest level among claims)
- base_score = (1 - (average_level - 1) / 3) * 100
- If level1_share > 0.3 or a high-impact commitment (net-zero, carbon neutral) is at level 1-2, increase base_score by 10-20 points.
- M5 = clamp(base_score, 0, 100)

### Final Scoring
- M3_weight = 0.40
- M4_weight = 0.20
- M5_weight = 0.40
- TGRI = M3 * 0.40 + M4 * 0.20 + M5 * 0.40
- risk_level: 0-25="低风险", 26-50="中低风险", 51-75="中高风险", 76-100="高风险"
- primary_type: the module with highest score determines: M3→"模糊修辞型", M4→"过度包装型", M5→"空洞承诺型". If M3 and M5 both high, use "模糊修辞+空洞承诺复合型".

### Output JSON (return ONLY this, no markdown fences):
{"gate":{"is_esg":true,"claim_direction":"positive_claim","text_types":["P"],"gate_result":"进入完整分析","scope_note":"基于文本的语言风险判断，不等于事实性定论"},"claims":[{"text":"原文","claim_type":"产品属性","level":2,"level_label":"模糊意向","specificity":"low","support_signals":[],"risk_flags":["模糊词"],"reasoning":"分类依据"}],"modules":{"M3_vagueness":{"score":0,"vague_words_found":[],"specific_markers_found":[],"vagueness_ratio":0,"vagueness_density":0,"flagged_sentences":[]},"M4_promotional_framing":{"score":0,"positive_signals":[],"balance_signals":[],"positivity_score":0,"flagged_sentences":[]},"M5_commitment_action":{"score":0,"statements":[],"average_level":1,"worst_level":1,"level1_share":0,"level2_share":0}},"scoring":{"S_language":0,"TGRI":0,"risk_level":"低风险","primary_type":"模糊修辞型","weight_distribution":{"M3_weight":0.4,"M4_weight":0.2,"M5_weight":0.4}},"summary":{"one_line":"总结","key_findings":[],"recommendations":[]},"quality_control":{"confidence":0.8,"confidence_reason":"说明","limitations":["仅基于文本，不核验外部事实"]}}

Text:
${text.slice(0, 5000)}`;
}

function buildPriorDataSection(enrichResult) {
  const parts = ["## 先验数据", ""];

  const vaguePhrases = (enrichResult.vagueExplanations || [])
    .map(e => e.original)
    .filter(Boolean);
  if (vaguePhrases.length > 0) {
    parts.push("### 已识别的模糊词");
    for (const phrase of vaguePhrases) {
      parts.push(`- ${phrase}`);
    }
    parts.push("");
  }

  const notes = enrichResult.credibilityNotes || [];
  if (notes.length > 0) {
    parts.push("### 已识别的声明");
    notes.forEach((n, i) => {
      parts.push(`${i + 1}. "${n.claim}" — 可信度 ${n.plausibility}（${n.reason}）`);
    });
    parts.push("");
  }

  const anns = enrichResult.annotations || [];
  if (anns.length > 0) {
    parts.push("### Annotations");
    for (const a of anns) {
      parts.push(`- ${a}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

function buildAugmentationPrompt(text, enrichResult) {
  const priorDataSection = buildPriorDataSection(enrichResult);

  return `You are a professional ESG greenwashing risk analyst. Analyze the provided text using the framework below. The prior data below has already been extracted from a previous analysis pass — do not re-extract claims from scratch; use credibilityNotes as the sole source for claims. Return ONLY valid JSON — no explanation outside the JSON, no markdown fences.

## 先验数据

${priorDataSection}

## Framework

### Claim Classification
Use these definitions when filling claim fields (see claim construction rules below for data source):
- claim_type: "产品属性" | "绩效披露" | "未来承诺" | "价值观表述" | "其他"
- level: 4=已实施行动(has results/quantification/verification), 3=有路径计划(has time+measures+resources), 2=模糊意向(direction without time+quantification+measures), 1=愿望性表述(values/attitude only, no action elements)
- level_label: 与 level 对应（愿望性表述/模糊意向/有路径计划/已实施行动）
- specificity: "low" | "medium" | "high"
- support_signals: list from ["数值/单位", "时间点/范围", "边界/范围", "方法/标准", "第三方认证/审计", "可核验行动"]
- risk_flags: list from ["模糊词", "绝对化表述", "缺少量化", "缺少时间", "缺少边界", "营销语气", "情绪号召"]

### M3: Vagueness (0-100)
Identify vague words that create positive green impressions without clear definition:
Chinese vague words: 环保, 绿色, 生态, 可持续, 天然, 清洁, 低碳, 零碳, 环境友好, 生态友好, 对地球友好, 负责任, 有机(无认证时), 无害, 更绿色, 更可持续, 引领变革, 绿色未来, 美好家园, 守护地球, 积极推进, 持续优化, 创新脱碳方案
English vague words: eco-friendly, green, sustainable, natural, clean, low-carbon, carbon-neutral, net-zero, climate-friendly, planet-friendly, responsible, environmentally conscious, biodegradable, greener, cleaner future, sustainability-led, nature positive

Also identify specificity markers: numbers+units, time points/baseline year, scope/boundary, methodology/standards, third-party certification/audit, verifiable actions.

Calculate:
- vague_words_count
- specific_markers_count
- vagueness_ratio = vague_words_count / max(vague_words_count + specific_markers_count, 1)
- vagueness_density = vague_words_count / max(total_tokens, 1)
- M3 = (vagueness_ratio * 0.65 + min(vagueness_density * 10, 1) * 0.35) * 100

vague_words_found 字段必须至少包含先验中所有 vaguePhrases；如你在文本中发现额外的模糊词，可补充到此列表。

### M4: Promotional Framing (0-100)
Positive packaging signals: superlatives, absolutes (100%, zero-impact, completely), self-praising ESG narratives, emotional appeals (for future generations, save the planet), values without constraints, marketing tone in disclosure documents.
Balance signals: admitting challenges/gaps, providing qualifications, stating boundaries/scope, mentioning negative changes/costs, noting uncertainties/method limitations.

- positive_signals_count
- balance_signals_count
- positivity_score = (positive_signals_count - balance_signals_count) / max(positive_signals_count + balance_signals_count, 1)
- M4 = ((positivity_score + 1) / 2) * 100

### M5: Commitment-to-Action Gap (0-100)
For each claim, assign level 1-4. Then calculate:
- average_level
- level1_share (proportion at level 1)
- level2_share (proportion at level 2)
- worst_level (lowest level among claims)
- base_score = (1 - (average_level - 1) / 3) * 100
- If level1_share > 0.3 or a high-impact commitment (net-zero, carbon neutral) is at level 1-2, increase base_score by 10-20 points.
- M5 = clamp(base_score, 0, 100)

### Final Scoring
- M3_weight = 0.40
- M4_weight = 0.20
- M5_weight = 0.40
- TGRI = M3 * 0.40 + M4 * 0.20 + M5 * 0.40
- risk_level: 0-25="低风险", 26-50="中低风险", 51-75="中高风险", 76-100="高风险"
- primary_type: the module with highest score determines: M3→"模糊修辞型", M4→"过度包装型", M5→"空洞承诺型". If M3 and M5 both high, use "模糊修辞+空洞承诺复合型".

## claims 字段构造规则（必须严格遵守）
- 数据源：仅使用上方先验的 credibilityNotes，不要新增先验里没有的声明
- 字段映射：
    text = credibilityNotes[i].claim
    reasoning = credibilityNotes[i].reason 的精炼版本（一句话）
    claim_type = 由你根据 text 判断（产品属性/绩效披露/未来承诺/价值观表述/其他）
    level (1-4) = 由你根据 text 与本 prompt 的 Level 定义判断
    level_label = 与 level 对应（愿望性表述/模糊意向/有路径计划/已实施行动）
    specificity = 由你判断 low/medium/high
    support_signals = 从清单中选（数值/单位、时间点/范围、边界/范围、方法/标准、第三方认证/审计、可核验行动）
    risk_flags = 若 text 中出现先验 vaguePhrases 中的任一词条，必须包含 "模糊词"；
                 其它 risk_flag 由你判断（绝对化表述/缺少量化/缺少时间/缺少边界/营销语气/情绪号召）
- 若 credibilityNotes 为空数组，claims 也返回空数组

## 输出
{
  "claims": [
    {
      "text": "原文",
      "claim_type": "产品属性",
      "level": 2,
      "level_label": "模糊意向",
      "specificity": "low",
      "support_signals": [],
      "risk_flags": ["模糊词"],
      "reasoning": "分类依据"
    }
  ],
  "modules": {
    "M3_vagueness": {
      "score": 0,
      "vague_words_found": [],
      "specific_markers_found": [],
      "vagueness_ratio": 0,
      "vagueness_density": 0,
      "flagged_sentences": []
    },
    "M4_promotional_framing": {
      "score": 0,
      "positive_signals": [],
      "balance_signals": [],
      "positivity_score": 0,
      "flagged_sentences": []
    },
    "M5_commitment_action": {
      "score": 0,
      "statements": [],
      "average_level": 1,
      "worst_level": 1,
      "level1_share": 0,
      "level2_share": 0
    }
  },
  "scoring": {
    "S_language": 0,
    "TGRI": 0,
    "risk_level": "低风险",
    "primary_type": "模糊修辞型",
    "weight_distribution": {
      "M3_weight": 0.4,
      "M4_weight": 0.2,
      "M5_weight": 0.4
    }
  },
  "quality_control": {
    "confidence": 0.8,
    "confidence_reason": "说明",
    "limitations": ["仅基于文本，不核验外部事实"]
  }
}

Text:
${text.slice(0, 5000)}`;
}

function mergeAugmentedResult(augmented, enrichResult, classification) {
  const posLen = augmented.modules?.M4_promotional_framing?.positive_signals?.length || 0;
  const balLen = augmented.modules?.M4_promotional_framing?.balance_signals?.length || 0;
  const claimDirection = posLen > balLen ? "positive_claim" : balLen > posLen ? "balanced_disclosure" : "mixed";

  const textTypes = [];
  if (classification?.contextType?.selected) {
    textTypes.push(classification.contextType.selected);
  }

  const summaryText = typeof enrichResult.summary === "string" ? enrichResult.summary : "";
  const keyFindings = (enrichResult.annotations || []).slice(0, 5);
  const recommendations = enrichResult.rewriteSuggestion ? [enrichResult.rewriteSuggestion] : [];

  return {
    gate: {
      is_esg: true,
      claim_direction: claimDirection,
      text_types: textTypes,
      gate_result: "进入完整分析",
      scope_note: "基于文本的语言风险判断，不等于事实性定论",
    },
    claims: augmented.claims || [],
    modules: augmented.modules || {},
    scoring: augmented.scoring || {},
    summary: {
      one_line: summaryText.slice(0, 200),
      key_findings: keyFindings,
      recommendations,
    },
    quality_control: augmented.quality_control || {
      confidence: 0,
      confidence_reason: "",
      limitations: ["仅基于文本，不核验外部事实"],
    },
  };
}

function parseDeepResult(rawText) {
  const trimmed = String(rawText || "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Deep analysis returned no valid JSON object.");
  }
  let jsonStr = jsonMatch[0];
  // Escape literal control characters inside JSON string values (between unescaped quotes)
  // Replace raw newlines, tabs, carriage returns that are inside string values
  jsonStr = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
  try {
    return JSON.parse(jsonStr);
  } catch {
    // If JSON.parse fails, try sanitizing control characters
    jsonStr = jsonMatch[0]
      .replace(/[\x00-\x1F\x7F]/g, (char) => {
        if (char === "\n") return "\\n";
        if (char === "\r") return "\\r";
        if (char === "\t") return "\\t";
        return "";
      });
    return JSON.parse(jsonStr);
  }
}

function validateDeepResult(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return createEmptyResult("LLM 返回结果格式无效。");
  }
  if (parsed.gate && !parsed.gate.is_esg) {
    return parsed;
  }
  return parsed;
}

function createEmptyResult(reason) {
  return {
    gate: {
      is_esg: false,
      claim_direction: null,
      text_types: [],
      gate_result: reason || "分析未能完成。",
      scope_note: "这是基于文本的语言风险判断，不等于事实性定论",
    },
    claims: [],
    modules: {
      M3_vagueness: { score: 0, vague_words_found: [], specific_markers_found: [], vagueness_ratio: 0, vagueness_density: 0, flagged_sentences: [] },
      M4_promotional_framing: { score: 0, positive_signals: [], balance_signals: [], positivity_score: 0, flagged_sentences: [] },
      M5_commitment_action: { score: 0, statements: [], average_level: 0, worst_level: 0, level1_share: 0, level2_share: 0 },
    },
    scoring: { S_language: 0, TGRI: 0, risk_level: "低风险", primary_type: "无", weight_distribution: { M3_weight: 0.4, M4_weight: 0.2, M5_weight: 0.4 } },
    summary: { one_line: reason || "分析未能完成。", key_findings: [], recommendations: [] },
    quality_control: { confidence: 0, confidence_reason: reason || "分析失败。", limitations: ["仅基于文本，不核验外部事实"] },
  };
}

async function deepAnalyze(text, classification) {
  const status = getServiceStatus();
  if (!status.enabled) {
    return {
      ...createEmptyResult("外部模型未启用。请在 .env 中配置 LLM_PROVIDER 和对应的 API Key。"),
      _meta: { provider: "none", enabled: false, model: null },
    };
  }

  const flag = (process.env.LLM_DEEP_CACHE_AUGMENT || "off").toLowerCase() === "on";

  if (flag && classification) {
    const cacheKey = llmCache.makeKey({
      text,
      contextType: classification?.contextType?.selected,
      sector: classification?.sector?.selected,
      provider: status.provider,
      model: status.model,
    });
    const cached = llmCache.get(cacheKey);

    const hasPrior = cached && (
      (cached.credibilityNotes && cached.credibilityNotes.length > 0) ||
      (cached.vagueExplanations && cached.vagueExplanations.length > 0)
    );

    if (hasPrior) {
      const augPrompt = buildAugmentationPrompt(text, cached);
      const rawText = await callProvider({
        provider: status.provider,
        model: status.model,
        prompt: augPrompt,
        maxTokens: 6000,
      });

      let parsed;
      try {
        parsed = parseDeepResult(rawText);
      } catch {
        parsed = createEmptyResult("LLM 返回结果解析失败，原始响应已保留。");
        parsed._rawText = rawText;
      }

      const merged = mergeAugmentedResult(parsed, cached, classification);
      merged._meta = {
        provider: status.provider,
        enabled: true,
        model: status.model,
        augmented: true,
      };
      return merged;
    }
  }

  const prompt = buildDeepPrompt(text);
  const rawText = await callProvider({
    provider: status.provider,
    model: status.model,
    prompt,
    maxTokens: 8000,
  });

  let parsed;
  try {
    parsed = validateDeepResult(parseDeepResult(rawText));
  } catch {
    parsed = {
      ...createEmptyResult("LLM 返回结果解析失败，原始响应已保留。"),
      _rawText: rawText,
    };
  }

  parsed._meta = {
    provider: status.provider,
    enabled: true,
    model: status.model,
    augmented: false,
  };

  return parsed;
}

module.exports = { buildAugmentationPrompt, deepAnalyze };
