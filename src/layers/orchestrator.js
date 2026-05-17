/**
 * Multi-layer analysis orchestrator.
 *
 * Wires Layer 0 (atomic claims) → Layer 1 (features) → Layer 3
 * (structured claim graph) into a single pipeline. Returned shape is
 * intentionally different from the v1 /api/analyze response — v1 keeps
 * running unchanged so existing UI doesn't break while v2 is being
 * built out.
 *
 * Modes:
 *   "fast"     — L0 + L1 only. No per-claim LLM call. Cheapest, fastest.
 *                Useful for textarea-level interactive analyze.
 *   "standard" — L0 + L1 + L3. One LLM call per claim for structure.
 *                Required for L4/L5/L6 in later stages.
 *
 * Future modes (not yet implemented, per detection plan §3.2):
 *   "deep"     — adds L2 (ClimateBERT classifiers via nlp-service),
 *                L4 (evidence-engine retrieval), L6 (cross-claim
 *                consistency), L7 (GRI aggregation).
 */

const L0 = require("./L0-preprocess");
const L1 = require("./L1-features");
const L3 = require("./L3-structurer");

const ORCHESTRATOR_VERSION = "orchestrator-0.1.0";

const VALID_MODES = ["fast", "standard"];

function detectLanguage(text) {
  const cjk = (String(text).match(/[一-鿿]/g) || []).length;
  const latin = (String(text).match(/[a-zA-Z]/g) || []).length;
  if (cjk === 0 && latin === 0) return "unknown";
  if (cjk === 0) return "en";
  if (latin === 0) return "zh";
  const r = cjk / (cjk + latin);
  if (r > 0.7) return "zh";
  if (r < 0.3) return "en";
  return "mixed";
}

async function analyze(rawText, options = {}) {
  const text = String(rawText || "").trim();
  const mode = VALID_MODES.includes(options.mode) ? options.mode : "fast";
  const elapsed = {};

  if (!text) {
    return {
      apiVersion: "v2",
      mode,
      document: {
        text_length: 0,
        language: "unknown",
        paragraph_count: 0,
        claim_count: 0,
      },
      perClaim: [],
      meta: {
        engineVersion: ORCHESTRATOR_VERSION,
        stages_run: [],
        elapsed_ms: {},
      },
    };
  }

  // L0 — atomic claim splitting
  const t0 = Date.now();
  const l0 = await L0.preprocess(text, { forceMode: options.forceMode });
  elapsed.L0 = Date.now() - t0;

  // L1 — per-claim features (deterministic, fast)
  const t1 = Date.now();
  const features = l0.claims.map((c) => L1.extractFeatures(c.text));
  elapsed.L1 = Date.now() - t1;

  // L3 — per-claim structuring (LLM, skipped in fast mode)
  let structures = [];
  if (mode === "standard") {
    const t3 = Date.now();
    structures = await L3.structureAll(l0.claims, {
      concurrency: options.l3_concurrency || 5,
      forceMode: options.forceMode,
    });
    elapsed.L3 = Date.now() - t3;
  }

  const perClaim = l0.claims.map((c, i) => ({
    claim_id: c.claim_id,
    text: c.text,
    span: c.span,
    paragraph_idx: c.paragraph_idx,
    claim_type: c.claim_type,
    has_data: c.has_data,
    language: c.language,
    features: features[i],
    structure: structures[i] || null,
  }));

  return {
    apiVersion: "v2",
    mode,
    document: {
      text_length: text.length,
      language: detectLanguage(text),
      paragraph_count: l0.meta.paragraphCount,
      claim_count: l0.claims.length,
      l0_source: l0.source,
    },
    perClaim,
    meta: {
      engineVersion: ORCHESTRATOR_VERSION,
      stages_run: mode === "standard" ? ["L0", "L1", "L3"] : ["L0", "L1"],
      elapsed_ms: elapsed,
    },
  };
}

module.exports = { analyze, VALID_MODES };
