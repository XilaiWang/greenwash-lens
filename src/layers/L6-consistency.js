/**
 * Layer 6 — cross-claim consistency + Seven Sins classification.
 *
 * Inputs (per-claim from upstream layers):
 *   - text
 *   - features        (Layer 1 output)
 *   - structure       (Layer 3 output: metric, scope, baseline, time_horizon)
 *   - certifications  (Layer 5a output)
 *
 * Outputs (document-level):
 *   {
 *     contradictions: [{ type, severity, claim_a_id, claim_b_id, detail }],
 *     sins: {  // keyed by Sin id; only Sins with at least one hit included
 *       hidden_tradeoff:   { hits: [{ claim_id, evidence, severity }], summary },
 *       no_proof:          { ... },
 *       vagueness:         { ... },
 *       false_labels:      { ... },
 *       irrelevance:       { ... },
 *       lesser_of_evils:   { ... },
 *       fibbing:           { ... }
 *     },
 *     summary: { contradiction_count, total_sin_hits }
 *   }
 *
 * Deterministic only — no LLM call. LLM-augmented Sin classification is
 * intentionally deferred to Stage 3 (Layer 7 GRI aggregator) where it
 * combines with overall scoring. Keeping Layer 6 deterministic means it
 * is fast, free, explainable, and unit-testable.
 *
 * The Seven Sins reference: TerraChoice (2007/2010) — see
 * docs/greenwashing-detection-plan.md §1.2 for the full taxonomy.
 */

const L6_VERSION = "L6-0.1.0";

// ──────────────── Contradiction detectors ────────────────

/**
 * Same metric (by normalized name) appearing with different values
 * across claims is a numeric contradiction.
 *
 * Example:
 *   Claim A: "Scope 1+2 emissions reduced 33% vs 2017"
 *   Claim B: "Scope 1+2 emissions reduced 25% vs 2017"
 *   → contradiction { type: 'numeric_metric_mismatch' }
 */
function detectNumericContradictions(perClaim) {
  const byKey = new Map();
  for (const c of perClaim) {
    const m = c?.structure?.metric;
    if (!m || m.value == null) continue;
    const key = normalizeMetricKey(m, c?.structure?.scope);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ claim_id: c.claim_id, value: m.value, unit: m.unit, text: c.text });
  }
  const out = [];
  for (const [key, items] of byKey.entries()) {
    if (items.length < 2) continue;
    // pair-wise compare; flag any pair with values >5% apart
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.unit && b.unit && a.unit !== b.unit) continue; // different units, skip
        const diff = Math.abs(a.value - b.value);
        const denom = Math.max(Math.abs(a.value), Math.abs(b.value), 1);
        if (diff / denom > 0.05) {
          out.push({
            type: "numeric_metric_mismatch",
            severity: diff / denom > 0.25 ? "high" : "medium",
            claim_a_id: a.claim_id,
            claim_b_id: b.claim_id,
            detail: `Metric '${key}' reported as ${a.value}${a.unit || ""} (${a.claim_id}) vs ${b.value}${b.unit || ""} (${b.claim_id})`,
          });
        }
      }
    }
  }
  return out;
}

function normalizeMetricKey(metric, scope) {
  const name = (metric?.name || "").toLowerCase().replace(/\s+/g, "_") || "unnamed_metric";
  const scopeBit = Array.isArray(scope?.ghg_scope) ? `_scope${scope.ghg_scope.join("")}` : "";
  return `${name}${scopeBit}`;
}

/**
 * Same metric (by key), different target_year. Often appears as
 * shifted timelines between claims — "by 2030" vs "by 2050".
 */
function detectTimeContradictions(perClaim) {
  const byKey = new Map();
  for (const c of perClaim) {
    const ty = c?.structure?.time_horizon?.target_year;
    if (!ty) continue;
    const m = c?.structure?.metric;
    if (!m && !c?.structure?.claim_type) continue;
    const key = normalizeMetricKey(m || {}, c?.structure?.scope);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ claim_id: c.claim_id, target_year: ty, text: c.text });
  }
  const out = [];
  for (const items of byKey.values()) {
    if (items.length < 2) continue;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].target_year !== items[j].target_year) {
          out.push({
            type: "target_year_mismatch",
            severity: "medium",
            claim_a_id: items[i].claim_id,
            claim_b_id: items[j].claim_id,
            detail: `Target year diverges: ${items[i].target_year} (${items[i].claim_id}) vs ${items[j].target_year} (${items[j].claim_id})`,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Absolute claim (e.g. "zero emissions") combined with a partial-scope
 * claim (e.g. "Scope 1+2 reduced 33%") in the same doc = scope contradiction.
 */
function detectScopeContradictions(perClaim) {
  const absolute = perClaim.filter((c) => c?.features?.categories?.absolute?.count > 0);
  const scoped = perClaim.filter(
    (c) => Array.isArray(c?.structure?.scope?.ghg_scope) && c.structure.scope.ghg_scope.length > 0,
  );
  const out = [];
  for (const a of absolute) {
    for (const s of scoped) {
      if (a.claim_id === s.claim_id) continue;
      // Heuristic: if absolute claim uses "net zero" / "carbon neutral" but
      // another claim shows partial-scope data, flag potential overstatement.
      const absLower = a.text.toLowerCase();
      if (!/net\s*zero|carbon\s*neutral|零排放|碳中和|净零/.test(absLower)) continue;
      const hasScope3 = (s.structure.scope.ghg_scope || []).includes(3);
      if (!hasScope3) {
        out.push({
          type: "absolute_vs_partial_scope",
          severity: "medium",
          claim_a_id: a.claim_id,
          claim_b_id: s.claim_id,
          detail: `Absolute claim "${a.text.slice(0, 60)}…" appears alongside scope-limited evidence in '${s.claim_id}' (Scope 3 not declared).`,
        });
      }
    }
  }
  return out;
}

// ──────────────── Seven Sins classifiers (rule-based) ────────────────

function sinHidden(claim) {
  // Sin #1 Hidden Trade-off — narrow-attribute green claim without scope.
  // Heuristic: greenClaims hit + NO scope declaration + NO Scope 3 mention.
  const greens = claim?.features?.categories?.greenClaims?.count || 0;
  const scopePresent = claim?.features?.categories?.scope?.present;
  const scope3 = (claim?.structure?.scope?.ghg_scope || []).includes(3);
  if (greens >= 1 && !scopePresent && !scope3) {
    return {
      severity: greens >= 3 ? "medium" : "low",
      evidence: `Claim asserts green attributes (${greens} hits) without specifying scope or boundaries.`,
    };
  }
  return null;
}

function sinNoProof(claim) {
  // Sin #2 No Proof — green claim with no proof terms AND no certifications mentioned.
  const greens = claim?.features?.categories?.greenClaims?.count || 0;
  const proofs = claim?.features?.categories?.proof?.count || 0;
  const certs = (claim?.certifications?.certifications || []).filter((c) => c.id).length;
  if (greens >= 1 && proofs === 0 && certs === 0) {
    return {
      severity: greens >= 3 ? "high" : "medium",
      evidence: `Green claim with ${greens} topic markers but zero proof terms and zero recognized certifications.`,
    };
  }
  return null;
}

function sinVagueness(claim) {
  // Sin #3 Vagueness — vague language without quantification.
  const vague = claim?.features?.categories?.vague?.count || 0;
  const quantified = claim?.features?.regex?.quantified;
  if (vague >= 2 && !quantified) {
    return {
      severity: vague >= 4 ? "high" : vague >= 3 ? "medium" : "low",
      evidence: `${vague} vague phrases with no quantitative data.`,
    };
  }
  return null;
}

function sinFalseLabels(claim) {
  // Sin #4 Worshiping False Labels — escalate to the worst severity
  // L5a flagged. Even a 'low' (vague "certified" with no authority)
  // is still a Sin #4 hit — just less serious.
  const signals = claim?.certifications?.false_label_signals || [];
  if (!signals.length) return null;
  const worst = signals.find((s) => s.severity === "high")
    || signals.find((s) => s.severity === "medium")
    || signals[0]; // low (or any other) — still a hit
  return { severity: worst.severity || "low", evidence: worst.description };
}

function sinIrrelevance(claim, certEntries) {
  // Sin #5 Irrelevance — claim mentions a long-banned topic
  // (e.g. CFC-free in 2026) or an outdated standard.
  // v1 heuristic: cert mentioned with founded_year before some cutoff
  // AND topic is "obsolete." This is hard to do well in rules — we
  // mark a single known case (CFC) and leave the rest for LLM-driven
  // Stage 3 Sin classification.
  if (/cfc[\s-]*free|无氟利昂/i.test(claim?.text || "")) {
    return {
      severity: "medium",
      evidence: "CFC-free claim is trivially true in 2026 (Montreal Protocol).",
    };
  }
  return null;
}

function sinLesserEvils(claim) {
  // Sin #6 Lesser of Two Evils — needs sector context. Without Layer 5b
  // baseline data, we can only weakly flag "fuel-efficient SUV" style
  // combos. Punted to Stage 5+ when CDP baselines arrive.
  return null;
}

function sinFibbing(claim) {
  // Sin #7 Fibbing — outright false. Cannot detect deterministically
  // without ground-truth verification (Layer 4 evidence-engine does
  // this on PDFs). Skip in rule-based L6.
  return null;
}

const SIN_DETECTORS = [
  ["hidden_tradeoff", sinHidden],
  ["no_proof",        sinNoProof],
  ["vagueness",       sinVagueness],
  ["false_labels",    sinFalseLabels],
  ["irrelevance",     sinIrrelevance],
  ["lesser_of_evils", sinLesserEvils],
  ["fibbing",         sinFibbing],
];

function classifySinsForClaim(claim, certEntries) {
  const out = {};
  for (const [sinId, fn] of SIN_DETECTORS) {
    const hit = fn(claim, certEntries);
    if (hit) out[sinId] = hit;
  }
  return out;
}

// ──────────────── Public API ────────────────

/**
 * Run Layer 6 over an array of per-claim payloads.
 *
 * Each payload should contain at minimum:
 *   { claim_id, text, features, structure, certifications }
 * Missing fields are tolerated (the relevant Sin detector simply
 * returns null rather than throwing).
 *
 * @param {Array} perClaim
 */
function analyze(perClaim) {
  if (!Array.isArray(perClaim) || perClaim.length === 0) {
    return {
      contradictions: [],
      sins: {},
      summary: { contradiction_count: 0, total_sin_hits: 0 },
      meta: { engineVersion: L6_VERSION },
    };
  }

  const contradictions = [
    ...detectNumericContradictions(perClaim),
    ...detectTimeContradictions(perClaim),
    ...detectScopeContradictions(perClaim),
  ];

  // Per-claim Sin classification, then group by sin
  const sinGroups = {};
  for (const claim of perClaim) {
    const sins = classifySinsForClaim(claim);
    for (const [sinId, hit] of Object.entries(sins)) {
      if (!sinGroups[sinId]) sinGroups[sinId] = { hits: [] };
      sinGroups[sinId].hits.push({
        claim_id: claim.claim_id,
        severity: hit.severity,
        evidence: hit.evidence,
      });
    }
  }

  // Per-sin summary
  for (const [sinId, group] of Object.entries(sinGroups)) {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const h of group.hits) counts[h.severity] = (counts[h.severity] || 0) + 1;
    group.summary = {
      hit_count: group.hits.length,
      by_severity: counts,
    };
  }

  return {
    contradictions,
    sins: sinGroups,
    summary: {
      contradiction_count: contradictions.length,
      total_sin_hits: Object.values(sinGroups).reduce((acc, g) => acc + g.hits.length, 0),
    },
    meta: { engineVersion: L6_VERSION },
  };
}

module.exports = {
  analyze,
  // Exposed for tests + future LLM-augmented stage
  _detectNumericContradictions: detectNumericContradictions,
  _detectTimeContradictions: detectTimeContradictions,
  _detectScopeContradictions: detectScopeContradictions,
  _classifySinsForClaim: classifySinsForClaim,
  SIN_IDS: SIN_DETECTORS.map(([id]) => id),
};
