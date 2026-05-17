const test = require("node:test");
const assert = require("node:assert/strict");

const L6 = require("../src/layers/L6-consistency");

// Test fixtures — build per-claim payloads matching the orchestrator's
// per-claim shape (text, features, structure, certifications).

function mkFeatures({ green = 0, vague = 0, absolute = 0, proof = 0, scope = false,
                     quantified = false, timeline = false } = {}) {
  return {
    categories: {
      greenClaims: { count: green, matches: [] },
      vague:       { count: vague, matches: [] },
      absolute:    { count: absolute, matches: [] },
      proof:       { count: proof, matches: [] },
      future:      { count: 0, matches: [] },
      emotional:   { count: 0, matches: [] },
      action:      { count: 0, matches: [] },
      scope:       { count: scope ? 1 : 0, matches: scope ? ["scope 1"] : [], present: scope },
    },
    regex: { quantified, timeline },
  };
}

function mkStructure({ metricName = null, metricValue = null, ghgScope = null,
                       targetYear = null } = {}) {
  return {
    claim_type: "performance",
    metric: metricName != null
      ? { name: metricName, value: metricValue, unit: "%" } : null,
    scope: { boundary: "corporate", ghg_scope: ghgScope },
    baseline: null,
    time_horizon: targetYear ? { start_year: null, target_year: targetYear } : null,
    evidence_cited: [],
    confidence: 0.8,
  };
}

test("L6 returns empty result on empty input", () => {
  const out = L6.analyze([]);
  assert.deepEqual(out.contradictions, []);
  assert.deepEqual(out.sins, {});
  assert.equal(out.summary.contradiction_count, 0);
});

test("numeric contradiction: same metric, divergent values", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "Scope 1+2 reduced 33%",
      features: mkFeatures(),
      structure: mkStructure({ metricName: "scope1_2_reduction", metricValue: 33, ghgScope: [1, 2] }),
    },
    {
      claim_id: "C2",
      text: "Scope 1+2 reduced 50%",
      features: mkFeatures(),
      structure: mkStructure({ metricName: "scope1_2_reduction", metricValue: 50, ghgScope: [1, 2] }),
    },
  ];
  const out = L6.analyze(claims);
  const numeric = out.contradictions.filter((c) => c.type === "numeric_metric_mismatch");
  assert.equal(numeric.length, 1);
  assert.equal(numeric[0].severity, "high"); // 17 / 50 = 34% diff
});

test("numeric contradiction NOT flagged if values within 5%", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "metric 33",
      features: mkFeatures(),
      structure: mkStructure({ metricName: "x", metricValue: 33 }),
    },
    {
      claim_id: "C2",
      text: "metric 34",
      features: mkFeatures(),
      structure: mkStructure({ metricName: "x", metricValue: 34 }),
    },
  ];
  const out = L6.analyze(claims);
  const numeric = out.contradictions.filter((c) => c.type === "numeric_metric_mismatch");
  assert.equal(numeric.length, 0);
});

test("target year mismatch flagged across claims with same metric", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "net zero by 2030",
      features: mkFeatures(),
      structure: mkStructure({ metricName: "net_zero", targetYear: 2030 }),
    },
    {
      claim_id: "C2",
      text: "net zero by 2050",
      features: mkFeatures(),
      structure: mkStructure({ metricName: "net_zero", targetYear: 2050 }),
    },
  ];
  const out = L6.analyze(claims);
  const t = out.contradictions.filter((c) => c.type === "target_year_mismatch");
  assert.equal(t.length, 1);
});

test("absolute vs partial scope contradiction", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "We are net zero in 2025.",
      features: mkFeatures({ absolute: 1 }),
      structure: mkStructure(),
    },
    {
      claim_id: "C2",
      text: "Scope 1+2 emissions reduced 33%.",
      features: mkFeatures({ scope: true }),
      structure: mkStructure({ metricName: "emissions", metricValue: 33, ghgScope: [1, 2] }),
    },
  ];
  const out = L6.analyze(claims);
  const s = out.contradictions.filter((c) => c.type === "absolute_vs_partial_scope");
  assert.equal(s.length, 1, "should flag net-zero claim alongside Scope 1+2-only reduction");
});

test("Sin: vagueness flagged with multiple vague terms + no data", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "We strive to lead the sustainable future.",
      features: mkFeatures({ vague: 3, green: 1 }),
      structure: null,
      certifications: { certifications: [], false_label_signals: [], summary: {} },
    },
  ];
  const out = L6.analyze(claims);
  assert.ok(out.sins.vagueness, "vagueness sin should be flagged");
  assert.equal(out.sins.vagueness.hits.length, 1);
});

test("Sin: no_proof flagged when green claim has no proof or cert", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "Our eco-friendly products are 100% sustainable.",
      features: mkFeatures({ green: 3, absolute: 1 }),
      structure: null,
      certifications: { certifications: [], false_label_signals: [], summary: { recognized_count: 0 } },
    },
  ];
  const out = L6.analyze(claims);
  assert.ok(out.sins.no_proof, "no_proof sin should be flagged");
});

test("Sin: no_proof NOT flagged when certifications recognized", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "ISO 14064 certified eco products.",
      features: mkFeatures({ green: 1, proof: 0 }),
      structure: null,
      certifications: {
        certifications: [{ id: "iso_14064", name: { en: "ISO 14064" } }],
        false_label_signals: [],
        summary: { recognized_count: 1 },
      },
    },
  ];
  const out = L6.analyze(claims);
  assert.equal(out.sins.no_proof, undefined, "recognized cert should suppress no_proof");
});

test("Sin: false_labels flagged when L5a found self-cert signal", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "Self-certified to our own standard.",
      features: mkFeatures(),
      structure: null,
      certifications: {
        certifications: [],
        false_label_signals: [{ signal: "self_certified", severity: "high", description: "x" }],
        summary: { suspicious_count: 1 },
      },
    },
  ];
  const out = L6.analyze(claims);
  assert.ok(out.sins.false_labels);
  assert.equal(out.sins.false_labels.hits[0].severity, "high");
});

test("Sin: hidden_tradeoff flagged when green claim lacks scope", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "Our packaging is recyclable and eco-friendly.",
      features: mkFeatures({ green: 2 }),
      structure: { scope: { ghg_scope: null } },
      certifications: { certifications: [] },
    },
  ];
  const out = L6.analyze(claims);
  assert.ok(out.sins.hidden_tradeoff);
});

test("Sin: irrelevance flagged for CFC-free claim", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "Our spray cans are CFC-free.",
      features: mkFeatures({ green: 1 }),
      structure: null,
      certifications: { certifications: [] },
    },
  ];
  const out = L6.analyze(claims);
  assert.ok(out.sins.irrelevance);
});

test("sins[sinId] carries severity counts in summary", () => {
  const claims = [
    {
      claim_id: "C1",
      text: "Self-certified to our own standard.",
      features: mkFeatures(),
      structure: null,
      certifications: {
        certifications: [],
        false_label_signals: [{ signal: "self_certified", severity: "high", description: "x" }],
      },
    },
    {
      claim_id: "C2",
      text: "Certified sustainable.",
      features: mkFeatures(),
      structure: null,
      certifications: {
        certifications: [],
        false_label_signals: [{ signal: "vague_certification_claim", severity: "low", description: "y" }],
      },
    },
  ];
  const out = L6.analyze(claims);
  // Both should land under false_labels (one high from C1, one low from C2)
  assert.equal(out.sins.false_labels.summary.hit_count, 2);
  assert.equal(out.sins.false_labels.summary.by_severity.high, 1);
  assert.equal(out.sins.false_labels.summary.by_severity.low, 1);
});

test("SIN_IDS exposes all seven sins for testing/iteration", () => {
  assert.deepEqual(L6.SIN_IDS, [
    "hidden_tradeoff", "no_proof", "vagueness", "false_labels",
    "irrelevance", "lesser_of_evils", "fibbing",
  ]);
});
