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

/**
 * Document metadata extractor — pulls company name + report year from
 * the first ~6000 chars of an extracted PDF. Used to pre-fill the
 * evidence-verification form so users don't have to retype.
 *
 * Falls back to filename-based guessing when LLM is unavailable:
 *   "Marks-and-Spencer-Group-plc-Annual-Report-and-Financial-Statements-2025_INTERACTIVE_FINAL-2.pdf"
 *   → { company: "Marks and Spencer Group plc", year: 2025 }
 */
async function extractDocumentMetadata({ text, filename } = {}) {
  const clean = String(text || "").slice(0, 6000).trim();
  const fname = String(filename || "").trim();
  const status = getServiceStatus();

  // Always run filename heuristic as a default; LLM overrides on success.
  const fallback = guessMetadataFromFilename(fname);

  if (!status.enabled || !clean) {
    return { ...fallback, source: status.enabled ? "filename" : "filename-no-llm" };
  }

  try {
    const prompt = buildExtractMetadataPrompt(clean, fname);
    const rawText = await callProvider({
      provider: status.provider,
      model: status.model,
      prompt,
    });
    const parsed = parseModelJson(rawText);
    if (!parsed || typeof parsed !== "object") return { ...fallback, source: "filename-llm-empty" };

    const company = (typeof parsed.company === "string" && parsed.company.trim())
      ? parsed.company.trim().slice(0, 120) : null;
    const yearRaw = Number(parsed.year);
    const year = Number.isInteger(yearRaw) && yearRaw >= 1900 && yearRaw <= 2100
      ? yearRaw : null;
    const reportType = ["esg_report", "annual_report", "sustainability_report",
      "csr_report", "tcfd_report", "other"].includes(parsed.report_type)
      ? parsed.report_type : "esg_report";
    const conf = Number(parsed.confidence);

    return {
      company: company || fallback.company,
      year: year || fallback.year,
      report_type: reportType,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.7,
      source: company && year ? "llm" : "llm-partial",
    };
  } catch {
    return { ...fallback, source: "filename-llm-error" };
  }
}

function guessMetadataFromFilename(filename) {
  if (!filename) return { company: null, year: null, report_type: "esg_report", confidence: 0.0 };
  const base = filename.replace(/\.pdf$/i, "");
  // First 4-digit year between 1990-2099, surrounded by non-digits.
  // (Can't use \b because filenames use _ which counts as word char.)
  const yearMatch = base.match(/(?:^|[^0-9])(19[9]\d|20\d{2})(?:[^0-9]|$)/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  // Take leading slug before year (or whole base), replace separators with spaces
  let company = base;
  if (yearMatch) {
    const yearStart = base.indexOf(yearMatch[1]);
    company = base.slice(0, yearStart).replace(/[-_\s]+$/g, "");
  }
  company = company
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return {
    company: company || null,
    year,
    report_type: "esg_report",
    confidence: 0.4,
  };
}

function buildExtractMetadataPrompt(text, filename) {
  return `Extract document metadata from this ESG / CSR / sustainability report front matter.

Return STRICT JSON only (no markdown fence). Schema:
{
  "company": "the publishing company's full official name (no tagline)",
  "year": 2024,
  "report_type": "esg_report|annual_report|sustainability_report|csr_report|tcfd_report|other",
  "confidence": 0.0-1.0
}

Rules:
- company: prefer the legal name as it appears on the title page (e.g. "Marks and Spencer Group plc"). If the doc is annual report style and the cover only shows a logo + tagline, infer from the running header / footer / "About us" section in the first page.
- year: the REPORTING year of the disclosure, NOT the publication year. E.g. "Annual Report and Financial Statements 2024" → 2024 even if published 2025. If a fiscal year range like "FY2023/24", return 2024.
- If confidence < 0.5, return null for the field you're unsure about.
- confidence: how sure you are the extracted fields are correct.

Filename (for context): ${filename || "(unknown)"}

First 6000 chars of extracted text:
${text}`;
}

/**
 * Layer 3 task — turn one atomic claim into a structured claim graph.
 *
 * Output schema (closed; unknown fields are dropped by the caller):
 *   {
 *     claim_text: string,
 *     claim_type: "vision" | "process" | "performance" | "commitment" | "disclosure",
 *     metric: { name, value, unit } | null,
 *     scope: { boundary: "product"|"corporate"|"value_chain"|"unknown", ghg_scope: [1|2|3] | null },
 *     baseline: { type: "absolute"|"relative"|"unknown", reference_year, reference_value } | null,
 *     time_horizon: { start_year, target_year } | null,
 *     evidence_cited: [{ type, name, identifier }],
 *     confidence: 0..1
 *   }
 *
 * Returns null on LLM unavailable / parse failure so the orchestrator can
 * fall back to a regex-derived stub.
 */
async function structureClaim(claimText) {
  const status = getServiceStatus();
  if (!status.enabled) return null;
  const clean = String(claimText || "").trim();
  if (!clean) return null;

  try {
    const prompt = buildStructureClaimPrompt(clean);
    const rawText = await callProvider({
      provider: status.provider,
      model: status.model,
      prompt,
    });
    const parsed = parseModelJson(rawText);
    if (!parsed || typeof parsed !== "object") return null;

    const allowedType = ["vision", "process", "performance", "commitment", "disclosure"];
    const allowedBoundary = ["product", "corporate", "value_chain", "unknown"];
    const allowedBaselineType = ["absolute", "relative", "unknown"];

    function normGhgScope(arr) {
      if (!Array.isArray(arr)) return null;
      const out = arr
        .map((x) => Number(x))
        .filter((x) => x === 1 || x === 2 || x === 3);
      return out.length ? out : null;
    }

    function normMetric(m) {
      if (!m || typeof m !== "object") return null;
      const value = Number(m.value);
      return {
        name: typeof m.name === "string" ? m.name : null,
        value: Number.isFinite(value) ? value : null,
        unit: typeof m.unit === "string" ? m.unit : null,
      };
    }

    function normBaseline(b) {
      if (!b || typeof b !== "object") return null;
      const refYear = Number(b.reference_year);
      const refVal = Number(b.reference_value);
      return {
        type: allowedBaselineType.includes(b.type) ? b.type : "unknown",
        reference_year: Number.isFinite(refYear) ? refYear : null,
        reference_value: Number.isFinite(refVal) ? refVal : null,
      };
    }

    function normTimeHorizon(t) {
      if (!t || typeof t !== "object") return null;
      const start = Number(t.start_year);
      const target = Number(t.target_year);
      const out = {
        start_year: Number.isFinite(start) ? start : null,
        target_year: Number.isFinite(target) ? target : null,
      };
      return (out.start_year || out.target_year) ? out : null;
    }

    function normEvidence(arr) {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((e) => e && typeof e === "object")
        .map((e) => ({
          type: typeof e.type === "string" ? e.type : "unspecified",
          name: typeof e.name === "string" ? e.name : null,
          identifier: typeof e.identifier === "string" ? e.identifier : null,
        }));
    }

    const conf = Number(parsed.confidence);

    return {
      claim_text: clean,
      claim_type: allowedType.includes(parsed.claim_type)
        ? parsed.claim_type
        : "disclosure",
      metric: normMetric(parsed.metric),
      scope: {
        boundary: allowedBoundary.includes(parsed?.scope?.boundary)
          ? parsed.scope.boundary
          : "unknown",
        ghg_scope: normGhgScope(parsed?.scope?.ghg_scope),
      },
      baseline: normBaseline(parsed.baseline),
      time_horizon: normTimeHorizon(parsed.time_horizon),
      evidence_cited: normEvidence(parsed.evidence_cited),
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.6,
    };
  } catch {
    return null;
  }
}

function buildStructureClaimPrompt(claimText) {
  return `You convert ONE atomic ESG claim into a structured representation.

Return STRICT JSON only (no markdown fence). Schema:
{
  "claim_type": "vision|process|performance|commitment|disclosure",
  "metric":   { "name": "...", "value": 33.0, "unit": "%" } | null,
  "scope":    { "boundary": "product|corporate|value_chain|unknown",
                "ghg_scope": [1, 2, 3] | null },
  "baseline": { "type": "absolute|relative|unknown",
                "reference_year": 2017, "reference_value": null } | null,
  "time_horizon": { "start_year": null, "target_year": 2030 } | null,
  "evidence_cited": [{ "type": "certification|report|audit|methodology|other",
                       "name": "...", "identifier": "..." }],
  "confidence": 0.0-1.0
}

Rules:
- claim_type:
    vision      = no measurable target
    process     = describes governance / methodology
    performance = past achievement with data
    commitment  = future target with date
    disclosure  = factual statement about current state
- metric.value: parse the number verbatim. Use null when not present.
- scope.ghg_scope: ONLY 1, 2, or 3 if the claim names a GHG scope; else null.
- baseline.reference_year: e.g. "vs 2016/17" → 2017 (target year of the baseline range).
- time_horizon.target_year: e.g. "by 2030" → 2030.
- evidence_cited: only certifications / reports / audits explicitly NAMED in the claim.
- confidence: how confident you are the structured fields capture the claim.

Atomic claim:
${claimText.slice(0, 1500)}`;
}

/**
 * Layer 0 task — split a free-text ESG passage into atomic claims.
 *
 * "Atomic" means: each returned text is one independently-verifiable
 * statement. The LLM is asked to:
 *   - split compound sentences into separate claims
 *   - drop pure framing/connective sentences (no verifiable content)
 *   - preserve numbers, dates, scopes verbatim (no paraphrasing)
 *   - return ordered list matching original document flow
 *
 * Returns: { claims: [{ text, claim_type, has_data, original_sentence_idx }] }
 * On any failure (no LLM key, parse error, etc.) returns null so callers
 * can fall back to paragraph-level splitting.
 */
async function extractAtomicClaims(text) {
  const status = getServiceStatus();
  if (!status.enabled) return null;
  const clean = String(text || "").trim();
  if (!clean) return { claims: [] };

  try {
    const prompt = buildAtomicClaimsPrompt(clean);
    const rawText = await callProvider({
      provider: status.provider,
      model: status.model,
      prompt,
    });
    const parsed = parseModelJson(rawText);
    const rawList = Array.isArray(parsed) ? parsed : (parsed?.claims || []);
    if (!Array.isArray(rawList)) return { claims: [] };

    const seen = new Set();
    const claims = [];
    for (let i = 0; i < rawList.length; i++) {
      const c = rawList[i];
      if (!c || typeof c !== "object") continue;
      const claimText = String(c.text || c.claim_text || "").trim();
      if (!claimText || claimText.length < 5) continue;
      // De-dupe exact-match texts (LLM occasionally repeats).
      if (seen.has(claimText)) continue;
      seen.add(claimText);

      claims.push({
        claim_id: `L0-${String(claims.length + 1).padStart(3, "0")}`,
        text: claimText,
        claim_type: ["achievement", "commitment", "vision", "disclosure", "process"]
          .includes(c.claim_type) ? c.claim_type : "disclosure",
        has_data: Boolean(c.has_data),
        original_sentence_idx: Number.isInteger(c.original_sentence_idx)
          ? c.original_sentence_idx : null,
      });
    }
    return { claims };
  } catch {
    return null;
  }
}

function buildAtomicClaimsPrompt(text) {
  return `You split ESG / sustainability text into ATOMIC, INDEPENDENTLY-VERIFIABLE claims.

Rules:
- Each output claim is ONE verifiable statement (subject + predicate + scope).
- Split compound sentences into separate atomic claims.
- DROP pure framing/connective text (e.g. "We are committed to...", "Our vision is...") UNLESS it contains a concrete commitment.
- Preserve numbers, percentages, scopes, baseline years VERBATIM. Do NOT paraphrase data.
- Order claims to match document flow (top to bottom).
- Limit to 30 claims per input. If text has more, return the 30 most verifiable.

Return strict JSON ONLY (no markdown fence). Schema:
{
  "claims": [
    {
      "text": "the atomic claim, in original language",
      "claim_type": "achievement|commitment|vision|disclosure|process",
      "has_data": true,
      "original_sentence_idx": 0
    }
  ]
}

claim_type:
  achievement = past-tense, measurable accomplishment ("reduced emissions by 33%")
  commitment  = future promise with target ("will reach net zero by 2030")
  vision      = aspirational, no measurable target ("aim to be a leading sustainable retailer")
  disclosure  = factual report of state/process ("our supplier code covers 230 sites")
  process     = methodology or governance description ("audited by KPMG quarterly")

has_data = true iff the claim contains a number, percentage, year, or quantitative unit.

Text to split:
${text.slice(0, 8000)}`;
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
  extractAtomicClaims,
  extractDocumentMetadata,
  getServiceStatus,
  parseModelJson,
  structureClaim,
  summarizeHistory,
  testLlmConnection,
};
