/**
 * Layer 3 — Structured claim graph.
 *
 * Input: an atomic claim (one of Layer 0's outputs).
 * Output: a structured claim object that downstream layers (L4 evidence
 *         verification, L5 external lookups, L6 cross-claim consistency,
 *         L7 GRI aggregation) can reason over without re-parsing free
 *         text.
 *
 * Why a Layer 3 at all?
 *   Layers 4-7 need to ask "what's the metric? what's the scope? what
 *   year?". Doing that pattern-matching inside each downstream layer
 *   would duplicate the work and create inconsistencies. L3 does it
 *   once, in a single LLM call per claim, and caches the result.
 *
 * Strategy:
 *   1. Try LLM-based structuring (handles paraphrase, inference, units).
 *   2. On LLM unavailable / failure, derive a stub via regex so the
 *      pipeline still emits SOMETHING for every claim.
 *
 * Cost: one LLM call per claim. For a typical 25-claim document with a
 * cheap model (DeepSeek), structuring all claims is ~$0.005-0.01.
 *
 * Output schema is documented in services/llm-service.js#structureClaim.
 */

const { structureClaim } = require("../services/llm-service");

const L3_VERSION = "L3-0.1.0";

// Regexes used by the fallback path. Intentionally permissive; whoever
// looks at fallback results in the UI will see confidence=0.4 so they
// know not to trust them like LLM-derived structures.
const METRIC_RE = /(\d+(?:\.\d+)?)\s?(%|percent|tCO2e|kg|tons?|MWh|GWh|kWh|m³|百分之|吨|千克|公斤|度)/i;
const TARGET_YEAR_RE = /by\s+((?:19|20)\d{2})|到\s?((?:19|20)\d{2})\s?年/i;
const BASELINE_YEAR_RE = /(?:vs|versus|compared to|since|相比|基准年|baseline)\s*(?:19|20)?(\d{2,4})/i;
const SCOPE_RE = /\bscope\s*([123])\b|范围\s?([一二三123])/gi;

const SCOPE_CN_MAP = { "一": 1, "二": 2, "三": 3 };

function detectGhgScope(claimText) {
  const found = new Set();
  let m;
  SCOPE_RE.lastIndex = 0;
  while ((m = SCOPE_RE.exec(claimText)) !== null) {
    const en = m[1];
    const cn = m[2];
    if (en) found.add(Number(en));
    if (cn) found.add(SCOPE_CN_MAP[cn] || Number(cn));
  }
  return found.size ? Array.from(found).sort() : null;
}

function fallbackStructure(claim) {
  const text = (claim && claim.text) || (typeof claim === "string" ? claim : "");
  const metricMatch = METRIC_RE.exec(text);
  const targetMatch = TARGET_YEAR_RE.exec(text);
  const baselineMatch = BASELINE_YEAR_RE.exec(text);

  const targetYear = targetMatch
    ? Number(targetMatch[1] || targetMatch[2])
    : null;

  let baselineYear = null;
  if (baselineMatch) {
    let raw = Number(baselineMatch[1]);
    if (raw < 100) raw = 2000 + raw; // "vs 17" → 2017
    baselineYear = raw;
  }

  // Crude claim-type guess from Layer 0 hint or text shape.
  let claimType = (claim && claim.claim_type) || "disclosure";
  if (!claimType || claimType === "disclosure") {
    if (targetYear && /will|plan|aim|pledge|commit|计划|承诺|将|到\s?20\d{2}/i.test(text)) {
      claimType = "commitment";
    } else if (metricMatch && /reduced|achieved|减少|已/i.test(text)) {
      claimType = "performance";
    }
  }

  return {
    claim_text: text,
    claim_type: claimType,
    metric: metricMatch
      ? { name: null, value: Number(metricMatch[1]), unit: metricMatch[2] }
      : null,
    scope: {
      boundary: "unknown",
      ghg_scope: detectGhgScope(text),
    },
    baseline: baselineYear
      ? { type: "relative", reference_year: baselineYear, reference_value: null }
      : null,
    time_horizon: targetYear ? { start_year: null, target_year: targetYear } : null,
    evidence_cited: [],
    confidence: 0.4,
  };
}

/**
 * Structure ONE atomic claim.
 *
 * @param {{ text: string, claim_type?: string } | string} claim
 * @param {{ forceMode?: "llm"|"fallback" }} [options]
 * @returns Promise<{ claim_text, claim_type, metric, scope, baseline,
 *                    time_horizon, evidence_cited, confidence,
 *                    source: "llm"|"fallback-regex", meta }>
 */
async function structureOne(claim, options = {}) {
  const text = (claim && claim.text) || (typeof claim === "string" ? claim : "");
  if (!text.trim()) {
    return {
      ...fallbackStructure(""),
      source: "fallback-regex",
      meta: { engineVersion: L3_VERSION },
    };
  }

  if (options.forceMode !== "fallback") {
    const llm = await structureClaim(text);
    if (llm) {
      return { ...llm, source: "llm", meta: { engineVersion: L3_VERSION } };
    }
  }

  return {
    ...fallbackStructure(claim),
    source: "fallback-regex",
    meta: { engineVersion: L3_VERSION },
  };
}

/**
 * Structure a batch of atomic claims with bounded concurrency.
 *
 * @param {Array} claims
 * @param {{ forceMode?: "llm"|"fallback", concurrency?: number }} [options]
 */
async function structureAll(claims, options = {}) {
  const concurrency = Math.max(1, Math.min(20, options.concurrency || 5));
  const results = new Array(claims.length);
  let cursor = 0;

  async function worker() {
    while (cursor < claims.length) {
      const i = cursor++;
      results[i] = await structureOne(claims[i], options);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, claims.length) }, worker);
  await Promise.all(workers);
  return results;
}

module.exports = {
  structureOne,
  structureAll,
  // Exposed for tests
  _fallbackStructure: fallbackStructure,
  _detectGhgScope: detectGhgScope,
};
