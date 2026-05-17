/**
 * Layer 1 — Surface signal feature extraction.
 *
 * Pure deterministic function. Reads `src/layers/data/dictionaries.yaml` once
 * at module load and returns a feature vector for any input text.
 *
 * Layer 1 does NOT score risk. Scoring lives in Layer 7 (aggregator), which
 * consumes feature vectors from L1/L2/L3/etc. This separation is what makes
 * the new multi-layer architecture testable and explainable: each layer is
 * either a pure extractor or a deliberate combiner.
 *
 * Backward compatibility: `src/engine-core.js` keeps its own inline copy of
 * the dictionaries during Stage 1. A parity test (test/layer1-features.test.js)
 * verifies the two stay in sync until engine-core's `scoreText` is retired.
 */

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const DICT_PATH = path.join(__dirname, "data", "dictionaries.yaml");

let _dictionariesCache = null;

function loadDictionaries() {
  if (_dictionariesCache) return _dictionariesCache;
  const raw = fs.readFileSync(DICT_PATH, "utf-8");
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== "object" || !doc.categories) {
    throw new Error(`L1 dictionaries.yaml malformed: missing 'categories'`);
  }
  const out = {};
  for (const [name, body] of Object.entries(doc.categories)) {
    if (!Array.isArray(body.terms)) {
      throw new Error(`L1 dictionaries.yaml: category '${name}' has no terms array`);
    }
    out[name] = body.terms;
  }
  _dictionariesCache = Object.freeze(out);
  return _dictionariesCache;
}

// Quantification regex — at least one digit followed by an ESG-relevant unit.
// Matches both English and Chinese unit markers.
const QUANT_RE = /\b\d+(\.\d+)?\s?(%|percent|tCO2e|kg|tons?|MWh|GWh|kWh|m³|hectare|acre|百分之|%|吨|千克|公斤|度)/i;

// Timeline regex — explicit calendar reference (year only).
const TIMELINE_RE = /\b(19|20)\d{2}\b|by\s+(19|20)\d{2}|到\s?(19|20)\d{2}\s?年/i;

// Approximate token count: split on whitespace + count CJK chars.
function approxTokens(text) {
  const ws = text.split(/\s+/).filter(Boolean).length;
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  return ws + Math.ceil(cjk * 0.6);
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

function findMatches(haystackLower, terms) {
  const hits = [];
  for (const term of terms) {
    if (haystackLower.includes(String(term).toLowerCase())) {
      hits.push(term);
    }
  }
  return hits;
}

/**
 * Extract Layer 1 features from raw text.
 *
 * @param {string} text
 * @returns {{
 *   text_length: number,
 *   tokens: number,
 *   language: 'en'|'zh'|'mixed'|'unknown',
 *   categories: {
 *     greenClaims: { count: number, matches: string[] },
 *     vague:       { count: number, matches: string[] },
 *     absolute:    { count: number, matches: string[] },
 *     proof:       { count: number, matches: string[], present: boolean },
 *     future:      { count: number, matches: string[] },
 *     emotional:   { count: number, matches: string[] },
 *     action:      { count: number, matches: string[] },
 *     scope:       { count: number, matches: string[], present: boolean },
 *   },
 *   regex: { quantified: boolean, timeline: boolean },
 *   meta: { engineVersion: string }
 * }}
 */
function extractFeatures(text) {
  const clean = String(text || "");
  const lower = clean.toLowerCase();
  const dicts = loadDictionaries();

  const categories = {};
  for (const [name, terms] of Object.entries(dicts)) {
    const matches = findMatches(lower, terms);
    const entry = { count: matches.length, matches };
    if (name === "proof" || name === "scope") {
      entry.present = matches.length > 0;
    }
    categories[name] = entry;
  }

  return {
    text_length: clean.length,
    tokens: approxTokens(clean),
    language: detectLanguage(clean),
    categories,
    regex: {
      quantified: QUANT_RE.test(clean),
      timeline: TIMELINE_RE.test(clean),
    },
    meta: { engineVersion: "L1-0.1.0" },
  };
}

module.exports = {
  extractFeatures,
  loadDictionaries,
  // Exposed for parity tests + future tools (linting, dict editing UI).
  _DICT_PATH: DICT_PATH,
};
