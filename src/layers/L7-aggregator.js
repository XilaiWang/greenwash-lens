/**
 * Layer 7 — synthesis & calibration. Turns per-claim upstream outputs
 * (L1 features, L3 structure, L5a certifications, L6 consistency) into
 * a document-level Greenwash Risk Index (GRI) + per-claim risk scores.
 *
 * Four risk components (each 0-100):
 *   text_risk        — vagueness, absolute claims, emotional appeals,
 *                      lack of action language (from L1)
 *   evidence_risk    — missing scope/baseline/metric (from L3), missing
 *                      certifications (from L5a)
 *   external_risk    — false-label signals (from L5a)
 *   consistency_risk — number/year/scope contradictions involving this
 *                      claim (from L6)
 *
 * Weights (v1, will be calibrated against the labelled corpus in
 * docs/greenwash-detection-plan.md §5.4 once data arrives):
 *   text=0.30, evidence=0.40, external=0.15, consistency=0.15
 *
 * Risk level bins match the existing app convention (low/mid-low/
 * mid-high/high). When Layer 4 evidence-engine is wired in (Stage 5+),
 * evidence_risk will switch from L5a-derived to L4 verdict-derived.
 *
 * IMPORTANT: Layer 7 is the ONLY layer that emits scores. Layers 0-6
 * extract features and label evidence; Layer 7 combines them. This
 * separation makes recalibration possible without rewriting detection
 * logic and makes the formula explainable per the EU ECGT auditability
 * requirement.
 */

const L7_VERSION = "L7-0.1.0";

const WEIGHTS = {
  text: 0.30,
  evidence: 0.40,
  external: 0.15,
  consistency: 0.15,
};

const SEVERITY_WEIGHTS = { high: 30, medium: 15, low: 5 };

function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function bin(score) {
  if (score <= 25) return "低风险";
  if (score <= 50) return "中低风险";
  if (score <= 75) return "中高风险";
  return "高风险";
}

// ──────────────── Per-claim component scores ────────────────

/**
 * text_risk — language-level surface signals from L1 + L3 type.
 * Higher = more concerning prose patterns.
 */
function scoreTextRisk(claim) {
  const f = claim?.features?.categories;
  if (!f) return 0;
  let score = 0;

  const greens = f.greenClaims?.count || 0;
  const vague = f.vague?.count || 0;
  const absolute = f.absolute?.count || 0;
  const emotional = f.emotional?.count || 0;
  const action = f.action?.count || 0;
  const proofs = f.proof?.count || 0;
  const quantified = claim?.features?.regex?.quantified;

  // Vague green claim is the classic greenwash pattern
  if (greens >= 1 && vague >= 1) score += 20;

  // Each vague term piles on, capped at +30 from this term
  score += Math.min(30, vague * 8);

  // Absolute claims without proof terms (no "certified" / "verified")
  if (absolute >= 1 && proofs === 0) score += 18;

  // Heavy emotional appeals substitute for data
  if (emotional >= 2) score += 12;

  // Counter-signals
  if (action >= 1) score -= 15;
  if (quantified) score -= 10;

  // Vision-only claims (no measurable target) are inherently text-heavy
  if (claim?.structure?.claim_type === "vision") score += 10;

  return clamp(score);
}

/**
 * evidence_risk — does the claim cite the data, scope, baseline, methods,
 * certifications needed to verify it?
 */
function scoreEvidenceRisk(claim) {
  let score = 50; // neutral starting point

  const s = claim?.structure;
  const hasMetric = !!(s?.metric && s.metric.value != null);
  const hasScope = Array.isArray(s?.scope?.ghg_scope) && s.scope.ghg_scope.length > 0;
  const hasBaseline = !!(s?.baseline && s.baseline.reference_year);
  const hasTimeHorizon = !!(s?.time_horizon && s.time_horizon.target_year);

  if (hasMetric) score -= 10;
  if (hasScope) score -= 15;
  if (hasBaseline) score -= 12;
  if (hasTimeHorizon) score -= 8;

  // Recognized certifications strongly reduce evidence risk
  const recognizedCerts = (claim?.certifications?.certifications || [])
    .filter((c) => c.id).length;
  score -= Math.min(30, recognizedCerts * 15);

  // Absolute claim without any of the above is bad
  const absolute = claim?.features?.categories?.absolute?.count || 0;
  if (absolute >= 1 && !hasScope && !hasBaseline && !hasMetric) {
    score += 25;
  }

  return clamp(score);
}

/**
 * external_risk — false-label signals from L5a.
 */
function scoreExternalRisk(claim) {
  const signals = claim?.certifications?.false_label_signals || [];
  let score = 0;
  for (const s of signals) {
    score += SEVERITY_WEIGHTS[s.severity] || 0;
  }
  return clamp(score);
}

/**
 * consistency_risk — contradictions involving this claim (from L6).
 * Caller passes the document-level contradictions; we filter to those
 * touching the given claim_id.
 */
function scoreConsistencyRisk(claim, contradictions) {
  if (!claim?.claim_id || !Array.isArray(contradictions)) return 0;
  let score = 0;
  for (const c of contradictions) {
    if (c.claim_a_id === claim.claim_id || c.claim_b_id === claim.claim_id) {
      score += SEVERITY_WEIGHTS[c.severity] || 0;
    }
  }
  return clamp(score);
}

/**
 * Combine the 4 components into a single 0-100 risk.
 */
function combine(components) {
  const sum =
    WEIGHTS.text * components.text_risk +
    WEIGHTS.evidence * components.evidence_risk +
    WEIGHTS.external * components.external_risk +
    WEIGHTS.consistency * components.consistency_risk;
  return clamp(sum);
}

/**
 * Sin IDs that triggered for a specific claim_id (helps perClaim narrative).
 */
function sinsForClaim(claimId, sinsMap) {
  if (!sinsMap || typeof sinsMap !== "object") return [];
  const out = [];
  for (const [sinId, group] of Object.entries(sinsMap)) {
    if ((group.hits || []).some((h) => h.claim_id === claimId)) {
      out.push(sinId);
    }
  }
  return out;
}

// ──────────────── Public API ────────────────

/**
 * Compute GRI for a document. Pure synthesis, no IO or LLM.
 *
 * @param {Array} perClaim       — claims with features, structure,
 *                                  certifications attached
 * @param {object} consistency   — L6 output ({contradictions, sins})
 * @returns {{
 *   perClaim: [{claim_id, components, claim_risk, risk_level, sins}],
 *   document: { text_risk, evidence_risk, external_risk,
 *               consistency_risk, GRI, risk_level },
 *   top_concerns: [{ sin_id, hit_count, severity_summary }],
 *   meta: { engineVersion, weights }
 * }}
 */
function aggregate(perClaim, consistency = null) {
  if (!Array.isArray(perClaim) || perClaim.length === 0) {
    return {
      perClaim: [],
      document: {
        text_risk: 0, evidence_risk: 0, external_risk: 0,
        consistency_risk: 0, GRI: 0, risk_level: "低风险",
      },
      top_concerns: [],
      meta: { engineVersion: L7_VERSION, weights: WEIGHTS },
    };
  }

  const contradictions = consistency?.contradictions || [];
  const sinsMap = consistency?.sins || {};

  const perClaimOut = perClaim.map((c) => {
    const components = {
      text_risk: scoreTextRisk(c),
      evidence_risk: scoreEvidenceRisk(c),
      external_risk: scoreExternalRisk(c),
      consistency_risk: scoreConsistencyRisk(c, contradictions),
    };
    const claim_risk = combine(components);
    return {
      claim_id: c.claim_id,
      components,
      claim_risk: Math.round(claim_risk * 10) / 10,
      risk_level: bin(claim_risk),
      sins: sinsForClaim(c.claim_id, sinsMap),
    };
  });

  // Document-level scores: BLEND of mean + max to avoid "averaging away"
  // tail risk. With LLM-split short atomic claims, a few bad claims would
  // be diluted by surrounding boilerplate if we used pure mean. The blend
  // (60% mean + 40% max) makes a single high-risk claim still raise the
  // headline GRI without making one mediocre claim dominate either.
  // This is a calibration v1 — will be refined against the labelled corpus.
  const docComponents = {
    text_risk: blendMeanMax(perClaimOut.map((c) => c.components.text_risk)),
    evidence_risk: blendMeanMax(perClaimOut.map((c) => c.components.evidence_risk)),
    external_risk: blendMeanMax(perClaimOut.map((c) => c.components.external_risk)),
    consistency_risk: blendMeanMax(perClaimOut.map((c) => c.components.consistency_risk)),
  };
  const GRI = combine(docComponents);

  // Top concerns: sort Sins by hit count, weight high-severity higher.
  const topConcerns = Object.entries(sinsMap)
    .map(([sin_id, group]) => {
      const sev = group.summary?.by_severity || { high: 0, medium: 0, low: 0 };
      const weighted_score = sev.high * 3 + sev.medium * 2 + sev.low * 1;
      return {
        sin_id,
        hit_count: group.summary?.hit_count || (group.hits || []).length,
        severity_summary: sev,
        weighted_score,
      };
    })
    .filter((c) => c.hit_count > 0)
    .sort((a, b) => b.weighted_score - a.weighted_score)
    .slice(0, 5);

  return {
    perClaim: perClaimOut,
    document: {
      ...docComponents,
      GRI: Math.round(GRI * 10) / 10,
      risk_level: bin(GRI),
    },
    top_concerns: topConcerns,
    meta: { engineVersion: L7_VERSION, weights: WEIGHTS },
  };
}

function meanRound(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((acc, v) => acc + v, 0) / arr.length;
  return Math.round(mean * 10) / 10;
}

// 60% mean + 40% max — favors flagging documents where any claim is bad,
// without letting a single mediocre claim dominate.
function blendMeanMax(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((acc, v) => acc + v, 0) / arr.length;
  const max = Math.max(...arr);
  return Math.round((0.6 * mean + 0.4 * max) * 10) / 10;
}

module.exports = {
  aggregate,
  WEIGHTS,
  // Exposed for tests
  _scoreTextRisk: scoreTextRisk,
  _scoreEvidenceRisk: scoreEvidenceRisk,
  _scoreExternalRisk: scoreExternalRisk,
  _scoreConsistencyRisk: scoreConsistencyRisk,
  _combine: combine,
  _bin: bin,
};
