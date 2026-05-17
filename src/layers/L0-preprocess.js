/**
 * Layer 0 — Preprocessing & atomic-claim splitting.
 *
 * Takes a free-text ESG passage (typically the textarea content or a
 * PDF-extracted block) and emits an ordered list of atomic claims with
 * source-text spans. Each downstream layer (L1 features, L3 structuring,
 * L4 evidence retrieval) operates on atomic claims, not on whole documents.
 *
 * Strategy:
 *   1. Normalize whitespace.
 *   2. Try LLM-based atomic splitting (semantic, handles compound sentences).
 *   3. On LLM unavailable / failure, fall back to deterministic paragraph
 *      and sentence splitting so the pipeline still produces SOMETHING.
 *   4. For each emitted claim, locate its first occurrence in the source text
 *      to compute char offsets and paragraph index. This grounding lets the
 *      UI highlight claims in the document reader and lets Layer 4 evidence
 *      verification map verdicts back to the page.
 *
 * Output schema:
 *   {
 *     claims: [{
 *       claim_id: "L0-001",
 *       text: "...",
 *       span: { start: 123, end: 234 } | null,
 *       paragraph_idx: 2 | null,
 *       claim_type: "achievement|commitment|vision|disclosure|process",
 *       has_data: bool,
 *       language: "en|zh|mixed|unknown",
 *     }],
 *     source: "llm" | "fallback-deterministic",
 *     meta: { engineVersion, paragraphCount }
 *   }
 *
 * Layer 0 is text-only. PDF / image inputs are handled upstream by
 * pdf-extractor.js (and a future OCR module per the detection plan).
 */

const { extractAtomicClaims } = require("../services/llm-service");

const L0_VERSION = "L0-0.1.0";

function normalizeText(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ")
    .replace(/[\t ]+/g, " ")
    // strip trailing spaces before each line break
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(text) {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

// Conservative sentence splitter — handles . ! ? and Chinese 。！？
function splitSentences(paragraph) {
  return paragraph
    .split(/(?<=[.!?。！？])\s+|(?<=[。！？])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function detectLanguage(text) {
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  if (cjk === 0 && latin === 0) return "unknown";
  if (cjk === 0) return "en";
  if (latin === 0) return "zh";
  const ratio = cjk / (cjk + latin);
  if (ratio > 0.7) return "zh";
  if (ratio < 0.3) return "en";
  return "mixed";
}

/**
 * Find paragraph index containing a char offset.
 * O(n) — fine for typical document sizes (<100 paragraphs).
 */
function paragraphIdxOf(paragraphs, originalText, charOffset) {
  if (charOffset == null || charOffset < 0) return null;
  let cursor = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const idx = originalText.indexOf(p, cursor);
    if (idx === -1) {
      cursor += p.length;
      continue;
    }
    if (charOffset >= idx && charOffset < idx + p.length) return i;
    cursor = idx + p.length;
  }
  return null;
}

/**
 * Locate a claim's first occurrence in the source text.
 * Returns { start, end } or null when the LLM rewrote the claim away from
 * a verbatim substring (we tell the LLM not to paraphrase, but it's not
 * guaranteed — caller should treat null as "highlight unavailable").
 */
function locateClaim(text, claimText) {
  if (!claimText) return null;
  const start = text.indexOf(claimText);
  if (start === -1) return null;
  return { start, end: start + claimText.length };
}

/**
 * Deterministic fallback: one claim per sentence, in document order.
 * Used when LLM is disabled, errors out, or returns empty.
 */
function fallbackSplit(text) {
  const paragraphs = splitParagraphs(text);
  const claims = [];
  paragraphs.forEach((para, pIdx) => {
    const sentences = splitSentences(para);
    for (const sent of sentences) {
      if (sent.length < 5) continue;
      const span = locateClaim(text, sent);
      claims.push({
        claim_id: `L0-${String(claims.length + 1).padStart(3, "0")}`,
        text: sent,
        span,
        paragraph_idx: pIdx,
        claim_type: "disclosure",
        has_data: /\d/.test(sent),
        language: detectLanguage(sent),
      });
    }
  });
  return claims;
}

/**
 * Main entry point.
 *
 * @param {string} rawText
 * @param {{ forceMode?: "llm"|"fallback" }} [options]
 * @returns Promise<{ claims, source, meta }>
 */
async function preprocess(rawText, options = {}) {
  const text = normalizeText(rawText);
  const paragraphs = splitParagraphs(text);

  if (!text) {
    return {
      claims: [],
      source: "fallback-deterministic",
      meta: { engineVersion: L0_VERSION, paragraphCount: 0 },
    };
  }

  const wantLlm = options.forceMode !== "fallback";

  if (wantLlm) {
    const llmOut = await extractAtomicClaims(text);
    if (llmOut && Array.isArray(llmOut.claims) && llmOut.claims.length > 0) {
      const claims = llmOut.claims.map((c, i) => {
        const span = locateClaim(text, c.text);
        const offset = span ? span.start : null;
        return {
          claim_id: `L0-${String(i + 1).padStart(3, "0")}`,
          text: c.text,
          span,
          paragraph_idx: offset != null
            ? paragraphIdxOf(paragraphs, text, offset)
            : null,
          claim_type: c.claim_type || "disclosure",
          has_data: Boolean(c.has_data),
          language: detectLanguage(c.text),
        };
      });
      return {
        claims,
        source: "llm",
        meta: { engineVersion: L0_VERSION, paragraphCount: paragraphs.length },
      };
    }
  }

  // Fallback path
  return {
    claims: fallbackSplit(text),
    source: "fallback-deterministic",
    meta: { engineVersion: L0_VERSION, paragraphCount: paragraphs.length },
  };
}

module.exports = {
  preprocess,
  // Exposed for unit tests
  _normalizeText: normalizeText,
  _splitParagraphs: splitParagraphs,
  _splitSentences: splitSentences,
  _detectLanguage: detectLanguage,
  _fallbackSplit: fallbackSplit,
  _locateClaim: locateClaim,
};
