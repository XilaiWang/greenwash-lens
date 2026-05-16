const { VALID_CONTEXT_TYPES, VALID_SECTORS } = require("../shared/classification-constants");
const llmCache = require("./llm-cache");

const DEFAULT_MODELS = {
  openai: "gpt-4.1-mini",
  claude: "claude-3-5-haiku-latest",
  gemini: "gemini-2.5-flash",
  deepseek: "deepseek-v4-flash",
};

function getServiceStatus() {
  const provider = normalizeProvider(process.env.LLM_PROVIDER);
  const apiKey = getProviderApiKey(provider);

  return {
    provider,
    enabled: Boolean(provider !== "none" && apiKey),
    model: getProviderModel(provider),
    mode: "external-api",
    configuredBy: ".env or process environment",
    missing: provider === "none" ? [] : missingKeys(provider),
  };
}

async function enrichAnalysis(input) {
  const status = getServiceStatus();

  if (!status.enabled) {
    return {
      enabled: false,
      provider: status.provider,
      model: status.model,
      summary: "LLM API is not configured. Local rule engine result was used.",
      annotations: [],
      vagueExplanations: [],
      contradictions: [],
      credibilityNotes: [],
      rewriteSuggestion: null,
      emotionAnalysis: null,
      error: null,
    };
  }

  try {
    const prompt = buildPrompt(input);
    const rawText = await callProvider({
      provider: status.provider,
      model: status.model,
      prompt,
    });
    const parsed = parseModelJson(rawText);

    const result = {
      enabled: true,
      provider: status.provider,
      model: status.model,
      summary: parsed.summary || rawText,
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
      adjustedRisk: Number.isFinite(parsed.adjustedRisk) ? parsed.adjustedRisk : null,
      evidenceStatus: parsed.evidenceStatus || "unknown",
      vagueExplanations: Array.isArray(parsed.vagueExplanations) ? parsed.vagueExplanations : [],
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
      credibilityNotes: Array.isArray(parsed.credibilityNotes) ? parsed.credibilityNotes : [],
      rewriteSuggestion: parsed.rewriteSuggestion || null,
      emotionAnalysis: normalizeEmotionAnalysis(parsed.emotionAnalysis),
      rawText,
      error: null,
    };

    const cacheKey = llmCache.makeKey({
      text: input.text,
      contextType: input.classification?.contextType?.selected,
      sector: input.classification?.sector?.selected,
      provider: status.provider,
      model: status.model,
    });
    llmCache.set(cacheKey, {
      summary: result.summary,
      annotations: result.annotations,
      vagueExplanations: result.vagueExplanations,
      credibilityNotes: result.credibilityNotes,
      rewriteSuggestion: result.rewriteSuggestion,
    });

    return result;
  } catch (error) {
    return {
      enabled: false,
      provider: status.provider,
      model: status.model,
      summary: "LLM API call failed. Local rule engine result was used.",
      annotations: [],
      vagueExplanations: [],
      contradictions: [],
      credibilityNotes: [],
      rewriteSuggestion: null,
      emotionAnalysis: null,
      error: error.message,
    };
  }
}

async function summarizeHistory(items) {
  const status = getServiceStatus();

  if (!status.enabled) {
    return { historySummary: null };
  }

  try {
    const prompt = buildHistoryPrompt(items);
    const rawText = await callProvider({
      provider: status.provider,
      model: status.model,
      prompt,
    });
    const parsed = parseModelJson(rawText);

    return {
      historySummary: typeof parsed.historySummary === "string" ? parsed.historySummary : null,
    };
  } catch {
    return { historySummary: null };
  }
}

async function testLlmConnection() {
  const status = getServiceStatus();

  if (!status.enabled) {
    return {
      ok: false,
      status,
      error: "LLM provider is not fully configured.",
    };
  }

  const rawText = await callProvider({
    provider: status.provider,
    model: status.model,
    prompt:
      'Return only this JSON: {"ok":true,"summary":"LLM connection is working."}',
  });

  return {
    ok: true,
    status,
    response: parseModelJson(rawText),
    rawText,
  };
}

async function callProvider({ provider, model, prompt, maxTokens }) {
  const opts = { model, prompt, maxTokens };
  if (provider === "openai") return callOpenAI(opts);
  if (provider === "claude") return callClaude(opts);
  if (provider === "gemini") return callGemini(opts);
  if (provider === "deepseek") return callDeepSeek(opts);

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

async function callOpenAI({ model, prompt, maxTokens }) {
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      temperature: 0.2,
      max_output_tokens: maxTokens || 1500,
      store: false,
    }),
  });
  const data = await parseJsonResponse(response);

  return extractOpenAIText(data);
}

async function callClaude({ model, prompt, maxTokens }) {
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await parseJsonResponse(response);

  return (data.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function callGemini({ model, prompt, maxTokens }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens || 1500,
      },
    }),
  });
  const data = await parseJsonResponse(response);

  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

async function callDeepSeek({ model, prompt, maxTokens }) {
  const response = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an ESG greenwashing risk reviewer. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: maxTokens || 1500,
      response_format: { type: "json_object" },
    }),
  });
  const data = await parseJsonResponse(response);

  return data.choices?.[0]?.message?.content?.trim() || "";
}

function buildPrompt({ text, classification, result }) {
  const vagueSignals = (result?.signals || []).filter((signal) => signal.startsWith("模糊表述: "));
  const greenSignals = (result?.signals || []).filter((signal) => signal.startsWith("绿色声明: "));
  const sector = classification?.sector?.selected || "general";

  return `You are an ESG greenwashing risk reviewer. Analyze the text in Chinese or English.

Return only valid JSON with this shape:
{
  "summary": "面向非技术人员的 3-5 句中文业务解读，说明主要风险点和原因，不用技术指标",
  "adjustedRisk": 0,
  "evidenceStatus": "supported | contradicted | insufficient | unknown",
  "annotations": ["简短中文批注"],
  "vagueExplanations": [
    {
      "original": "命中的模糊原文片段",
      "issue": "为什么这是模糊的（缺什么）",
      "suggestion": "具体的改写建议，补上量化/范围/时间"
    }
  ],
  "contradictions": [
    {
      "claimA": "第一句矛盾声明",
      "claimB": "第二句矛盾声明",
      "explanation": "为什么矛盾"
    }
  ],
  "credibilityNotes": [
    {
      "claim": "原文中的行动声明",
      "plausibility": "high | medium | low",
      "reason": "在该行业背景下的可信度判断依据"
    }
  ],
  "rewriteSuggestion": "把整段原文改写为合规版本，补上量化指标、时间边界、证据来源，并使用 [请填入具体百分比] 这类占位符",
  "emotionAnalysis": {
    "score": 0,
    "level": "none | low | medium | high",
    "rationale": "中文说明该文本是否使用恐惧、愧疚、过度希望、自豪感等情绪来替代证据",
    "signals": ["简短中文情绪信号"]
  },
  "historySummary": null
}

Use the local rule-engine result as a baseline, but do not invent facts outside the provided text.
` +
`
Additional instructions:
- summary 必须用中文业务解读风格，面向市场部或合规部人员，不要输出 vagueness: 24 这类技术指标
- vagueExplanations 只针对下方列出的“模糊表述”片段，逐条解释问题并给改写建议
- contradictions 只检查文本内部是否自相矛盾；没有矛盾时返回 []
- credibilityNotes 只针对下方列出的“绿色声明”片段，结合行业 ${sector} 评估可信度
- rewriteSuggestion 必须是整段文本的合规改写版，并包含像 [请填入具体百分比]、[请填入基准年]、[请填入第三方来源] 这样的占位符
- emotionAnalysis.score 必须是 0-100，衡量绿色声明中“情绪操纵/情绪替代证据”的风险，而不是一般正负面情绪
- emotionAnalysis.level 使用 none/low/medium/high，signals 只列明显的情绪性话术
- 普通分析时 historySummary 必须返回 null

Input text:
${text}

Detected classification:
${JSON.stringify(classification)}

Local rule-engine result:
${JSON.stringify(result)}

Vague signal fragments:
${JSON.stringify(vagueSignals)}

Green-claim signal fragments:
${JSON.stringify(greenSignals)}`;
}

function buildHistoryPrompt(items) {
  return `You are an ESG greenwashing trend analyst.

Return only valid JSON with this shape:
{
  "historySummary": "3-5 句中文汇总，包括最常见问题、行业分布、趋势变化"
}

Write for non-technical business users. Mention the most common recurring risks, the main industry/context distribution, and whether recent entries look riskier or more evidence-backed. If the sample is too small, say so briefly.

History items:
${JSON.stringify(items)}`;
}

async function classifyWithLLM(text) {
  const status = getServiceStatus();
  if (!status.enabled) return null;

  try {
    const prompt = buildClassifyPrompt(text);
    const rawText = await callProvider({
      provider: status.provider,
      model: status.model,
      prompt,
    });
    const parsed = parseModelJson(rawText);
    const contextType = VALID_CONTEXT_TYPES.includes(parsed.contextType)
      ? parsed.contextType
      : null;
    const sector = VALID_SECTORS.includes(parsed.sector)
      ? parsed.sector
      : null;

    if (!contextType && !sector) return null;

    return {
      contextType,
      sector,
      confidence: Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : null,
    };
  } catch {
    return null;
  }
}

function buildClassifyPrompt(text) {
  return `Classify this text into two categories. Return only valid JSON.

Context types (pick one): marketing, product, report, social, press_release, investor_relations, policy, employer_branding
Sectors (pick one): general, energy, fashion, aviation, manufacturing, finance, technology, food_agriculture, construction_realestate, automotive, consumer_goods, healthcare

Return JSON:
{
  "contextType": "the best match",
  "sector": "the best match",
  "confidence": 0.8,
  "reasoning": "one short sentence in Chinese explaining why"
}

Text:
${text.slice(0, 3000)}`;
}

function normalizeProvider(value) {
  const provider = String(value || "none").trim().toLowerCase();

  if (["openai", "claude", "gemini", "deepseek"].includes(provider)) {
    return provider;
  }

  return "none";
}

function getProviderApiKey(provider) {
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "claude") return process.env.ANTHROPIC_API_KEY;
  if (provider === "gemini") return process.env.GEMINI_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  return "";
}

function getProviderModel(provider) {
  if (provider === "openai") return process.env.OPENAI_MODEL || DEFAULT_MODELS.openai;
  if (provider === "claude") return process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.claude;
  if (provider === "gemini") return process.env.GEMINI_MODEL || DEFAULT_MODELS.gemini;
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL || DEFAULT_MODELS.deepseek;
  return null;
}

function missingKeys(provider) {
  if (provider === "openai" && !process.env.OPENAI_API_KEY) return ["OPENAI_API_KEY"];
  if (provider === "claude" && !process.env.ANTHROPIC_API_KEY) return ["ANTHROPIC_API_KEY"];
  if (provider === "gemini" && !process.env.GEMINI_API_KEY) return ["GEMINI_API_KEY"];
  if (provider === "deepseek" && !process.env.DEEPSEEK_API_KEY) return ["DEEPSEEK_API_KEY"];
  return [];
}

async function fetchWithTimeout(url, options) {
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.error?.message || data.error || response.statusText;
    throw new Error(`LLM API error (${response.status}): ${message}`);
  }

  return data;
}

function extractOpenAIText(data) {
  if (data.output_text) return data.output_text;

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

function parseModelJson(text) {
  const trimmed = String(text || "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      summary: trimmed,
      annotations: [],
    };
  }

  return JSON.parse(jsonMatch[0]);
}

function normalizeEmotionAnalysis(value) {
  if (!value || typeof value !== "object") return null;
  const score = Number(value.score);

  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
    level: ["none", "low", "medium", "high"].includes(value.level) ? value.level : null,
    rationale: typeof value.rationale === "string" ? value.rationale : "",
    signals: Array.isArray(value.signals) ? value.signals : [],
  };
}

module.exports = {
  callProvider,
  classifyWithLLM,
  enrichAnalysis,
  getServiceStatus,
  parseModelJson,
  summarizeHistory,
  testLlmConnection,
};
