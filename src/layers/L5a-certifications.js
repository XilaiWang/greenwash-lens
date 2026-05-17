/**
 * Layer 5a — certification & label verification.
 *
 * Inputs (per atomic claim):
 *   - text (the claim itself)
 *   - structure (Layer 3 output; may contain evidence_cited)
 *
 * Outputs per claim:
 *   {
 *     certifications: [{ id, name, type, authority, verification_url }],
 *     false_label_signals: [{ signal, severity, description }],
 *     summary: { recognized_count, suspicious_count }
 *   }
 *
 * What this counter-signals:
 *   - TerraChoice Sin #2 (No Proof): a recognized cert mention REDUCES
 *     the no-proof score. Layer 7 (aggregator) consumes this.
 *   - TerraChoice Sin #4 (Worshiping False Labels): self-certified /
 *     "our own standard" patterns get flagged here.
 *
 * What this does NOT do:
 *   - Verify the company actually holds the cert (would need
 *     authority-specific lookup APIs — punted to Stage 5+).
 *   - Detect fully fabricated cert names (regex won't catch unknown
 *     strings; Layer 6 LLM Sin classifier will).
 */

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const CERT_PATH = path.join(__dirname, "data", "certifications.yaml");
const L5A_VERSION = "L5a-0.1.0";

let _cache = null;

function loadCertifications() {
  if (_cache) return _cache;
  const raw = fs.readFileSync(CERT_PATH, "utf-8");
  const doc = yaml.load(raw);
  if (!doc?.certifications || !Array.isArray(doc.certifications)) {
    throw new Error("certifications.yaml malformed: missing 'certifications' array");
  }
  const compiled = doc.certifications.map((c) => {
    if (!c.id || !c.identifier_pattern) {
      throw new Error(`certifications.yaml entry missing id/identifier_pattern: ${JSON.stringify(c)}`);
    }
    let re;
    try {
      re = new RegExp(c.identifier_pattern, "i");
    } catch (err) {
      throw new Error(`bad regex in certification '${c.id}': ${err.message}`);
    }
    return {
      id: c.id,
      name: c.name || { en: c.id, zh: c.id },
      authority: c.authority || "",
      domain: c.domain || [],
      type: c.type || "unknown",
      region: c.region || "global",
      verification_url: c.verification_url || null,
      founded_year: Number.isInteger(c.founded_year) ? c.founded_year : null,
      official: c.official !== false,
      _re: re,
    };
  });
  _cache = Object.freeze({ entries: compiled, version: doc.version || 1 });
  return _cache;
}

// Self-certification / false-label heuristic patterns.
// These trigger a "suspicious" flag regardless of whether the claim
// also names a real cert.
const FALSE_LABEL_PATTERNS = [
  {
    re: /self[\s-]certified|self[\s-]declared|our\s+own\s+(?:\w+\s+)?(?:standard|certification|seal)|in[\s-]house\s+(?:cert|standard|verification)|自我认证|自我声明|自定义\s?(?:标准|认证)/i,
    signal: "self_certified",
    severity: "high",
    description_zh: "自我认证 / 自定义标准——非独立第三方背书。",
  },
  {
    re: /unverified\s+claim|no\s+independent\s+verification|未经(?:独立)?\s?验证|未经审计|自评估/i,
    signal: "no_independent_verification",
    severity: "medium",
    description_zh: "声明未经独立第三方核实。",
  },
  {
    re: /(?:industry|market)\s+leader|绝对\s?领先(?:行业)?|行业\s?第一(?!\s*家)|最(?:环保|绿色|可持续)|没有\s?(?:竞争对手|对手)/i,
    signal: "unsubstantiated_superlative",
    severity: "medium",
    description_zh: "未提供基准的最高级声明（如\"行业领先\"、\"最环保\"）。",
  },
  {
    re: /\b(?:certified|认证)\b(?!\s+(?:by|to|under|to\s+the|under\s+the|per|against|的|于)\b)/i,
    signal: "vague_certification_claim",
    severity: "low",
    description_zh: "使用 \"certified / 认证\" 但未指明颁发机构或标准。",
  },
];

/**
 * Scan a single claim for certification mentions + false-label signals.
 *
 * @param {{ text: string, structure?: object }} claim
 * @returns {{ certifications, false_label_signals, summary, meta }}
 */
function verifyOne(claim) {
  const text = (claim && claim.text) || (typeof claim === "string" ? claim : "");
  if (!text || typeof text !== "string") {
    return {
      certifications: [],
      false_label_signals: [],
      summary: { recognized_count: 0, suspicious_count: 0 },
      meta: { engineVersion: L5A_VERSION },
    };
  }

  const { entries } = loadCertifications();
  const certifications = [];
  for (const c of entries) {
    if (c._re.test(text)) {
      certifications.push({
        id: c.id,
        name: c.name,
        authority: c.authority,
        type: c.type,
        domain: c.domain,
        region: c.region,
        verification_url: c.verification_url,
        founded_year: c.founded_year,
      });
    }
  }

  // Also fold in any evidence_cited from Layer 3 that we didn't catch
  // by name — useful for less-common certs the LLM picked up.
  const cited = claim?.structure?.evidence_cited;
  if (Array.isArray(cited)) {
    for (const e of cited) {
      const nameLower = String(e?.name || "").toLowerCase();
      if (!nameLower) continue;
      const known = certifications.some(
        (c) => (c.name?.en || "").toLowerCase().includes(nameLower) ||
               (c.name?.zh || "").toLowerCase().includes(nameLower) ||
               c.id.toLowerCase().includes(nameLower.replace(/\s/g, "_")),
      );
      if (!known) {
        certifications.push({
          id: null,
          name: { en: e.name, zh: null },
          authority: null,
          type: e.type || "unspecified",
          source: "layer3_evidence_cited",
        });
      }
    }
  }

  const false_label_signals = [];
  for (const p of FALSE_LABEL_PATTERNS) {
    if (p.re.test(text)) {
      false_label_signals.push({
        signal: p.signal,
        severity: p.severity,
        description: p.description_zh,
      });
    }
  }

  return {
    certifications,
    false_label_signals,
    summary: {
      recognized_count: certifications.filter((c) => c.id).length,
      suspicious_count: false_label_signals.length,
    },
    meta: { engineVersion: L5A_VERSION },
  };
}

/**
 * Verify a batch of claims (synchronous — no IO past first YAML load).
 *
 * @param {Array} claims
 */
function verifyAll(claims) {
  if (!Array.isArray(claims)) return [];
  return claims.map(verifyOne);
}

module.exports = {
  verifyOne,
  verifyAll,
  loadCertifications,
  _CERT_PATH: CERT_PATH,
  _FALSE_LABEL_PATTERNS: FALSE_LABEL_PATTERNS,
};
