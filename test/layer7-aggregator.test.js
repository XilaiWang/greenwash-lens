const test = require("node:test");
const assert = require("node:assert/strict");

const L7 = require("../src/layers/L7-aggregator");

function mkFeatures({ green = 0, vague = 0, absolute = 0, proof = 0, emotional = 0,
                     action = 0, scope = false, quantified = false } = {}) {
  return {
    categories: {
      greenClaims: { count: green, matches: [] },
      vague:       { count: vague, matches: [] },
      absolute:    { count: absolute, matches: [] },
      proof:       { count: proof, matches: [] },
      future:      { count: 0, matches: [] },
      emotional:   { count: emotional, matches: [] },
      action:      { count: action, matches: [] },
      scope:       { count: scope ? 1 : 0, matches: [], present: scope },
    },
    regex: { quantified, timeline: false },
  };
}

test("_bin maps GRI to four level names", () => {
  assert.equal(L7._bin(0), "低风险");
  assert.equal(L7._bin(25), "低风险");
  assert.equal(L7._bin(26), "中低风险");
  assert.equal(L7._bin(50), "中低风险");
  assert.equal(L7._bin(51), "中高风险");
  assert.equal(L7._bin(75), "中高风险");
  assert.equal(L7._bin(76), "高风险");
  assert.equal(L7._bin(100), "高风险");
});

test("_scoreTextRisk: vague green claim is high text risk", () => {
  const score = L7._scoreTextRisk({
    text: "We strive to lead a greener future.",
    features: mkFeatures({ green: 1, vague: 3 }),
  });
  assert.ok(score >= 40, `expected ≥40, got ${score}`);
});

test("_scoreTextRisk: data-backed action language is low text risk", () => {
  const score = L7._scoreTextRisk({
    text: "We achieved 33% Scope 1 reduction.",
    features: mkFeatures({ green: 1, action: 1, quantified: true }),
  });
  assert.ok(score <= 10, `expected ≤10, got ${score}`);
});

test("_scoreEvidenceRisk: well-structured claim with cert is low risk", () => {
  const score = L7._scoreEvidenceRisk({
    text: "Scope 1+2 cut 33% vs 2017 per ISO 14064-1.",
    features: mkFeatures({ scope: true }),
    structure: {
      metric: { name: "scope1_2", value: 33, unit: "%" },
      scope: { boundary: "corporate", ghg_scope: [1, 2] },
      baseline: { type: "relative", reference_year: 2017, reference_value: null },
      time_horizon: null,
    },
    certifications: {
      certifications: [{ id: "iso_14064", name: { en: "ISO 14064" } }],
      false_label_signals: [],
    },
  });
  assert.ok(score <= 5, `expected ≤5 (50 - 10 - 15 - 12 - 15), got ${score}`);
});

test("_scoreEvidenceRisk: absolute claim with no scope/metric/baseline is high", () => {
  const score = L7._scoreEvidenceRisk({
    text: "We are 100% carbon neutral.",
    features: mkFeatures({ absolute: 1 }),
    structure: null,
    certifications: { certifications: [], false_label_signals: [] },
  });
  assert.ok(score >= 70, `expected ≥70, got ${score}`);
});

test("_scoreExternalRisk: high-severity false_label_signal hits 30", () => {
  const score = L7._scoreExternalRisk({
    certifications: {
      false_label_signals: [{ signal: "self_certified", severity: "high" }],
    },
  });
  assert.equal(score, 30);
});

test("_scoreConsistencyRisk: claim involved in 2 contradictions accumulates severity", () => {
  const score = L7._scoreConsistencyRisk(
    { claim_id: "C1" },
    [
      { claim_a_id: "C1", claim_b_id: "C2", severity: "high" },
      { claim_a_id: "C3", claim_b_id: "C1", severity: "medium" },
      { claim_a_id: "C4", claim_b_id: "C5", severity: "high" }, // not involving C1
    ],
  );
  assert.equal(score, 45); // 30 (high) + 15 (medium)
});

test("aggregate: empty input → all zeros, low risk", () => {
  const out = L7.aggregate([]);
  assert.equal(out.document.GRI, 0);
  assert.equal(out.document.risk_level, "低风险");
  assert.deepEqual(out.perClaim, []);
});

test("aggregate: weighted formula combines components correctly", () => {
  const components = {
    text_risk: 50,
    evidence_risk: 50,
    external_risk: 50,
    consistency_risk: 50,
  };
  assert.equal(L7._combine(components), 50);

  const heavyText = {
    text_risk: 100,
    evidence_risk: 0,
    external_risk: 0,
    consistency_risk: 0,
  };
  // 0.30 * 100 = 30
  assert.equal(L7._combine(heavyText), 30);
});

test("aggregate: claim risk reflects all four components", () => {
  const perClaim = [{
    claim_id: "C1",
    text: "We strive to lead a greener future.",
    features: mkFeatures({ green: 2, vague: 3 }),
    structure: null,
    certifications: { certifications: [], false_label_signals: [] },
  }];
  const out = L7.aggregate(perClaim, { contradictions: [], sins: {} });
  assert.equal(out.perClaim.length, 1);
  const c = out.perClaim[0];
  assert.ok(c.components.text_risk > 0);
  assert.ok(c.components.evidence_risk > 0);
  assert.ok(typeof c.claim_risk === "number");
  assert.ok(["低风险", "中低风险", "中高风险", "高风险"].includes(c.risk_level));
});

test("aggregate: per-claim sins list reflects L6 sin hits", () => {
  const perClaim = [{
    claim_id: "C1",
    text: "x",
    features: mkFeatures(),
    structure: null,
    certifications: { certifications: [], false_label_signals: [] },
  }];
  const out = L7.aggregate(perClaim, {
    contradictions: [],
    sins: {
      vagueness: { hits: [{ claim_id: "C1", severity: "low", evidence: "" }],
                   summary: { hit_count: 1, by_severity: { high: 0, medium: 0, low: 1 } } },
    },
  });
  assert.deepEqual(out.perClaim[0].sins, ["vagueness"]);
});

test("aggregate: top_concerns ranks sins by weighted severity", () => {
  const perClaim = [{
    claim_id: "C1", text: "x",
    features: mkFeatures(),
    certifications: { certifications: [], false_label_signals: [] },
  }];
  const out = L7.aggregate(perClaim, {
    contradictions: [],
    sins: {
      vagueness: {
        hits: [{ claim_id: "C1", severity: "low", evidence: "" }],
        summary: { hit_count: 1, by_severity: { high: 0, medium: 0, low: 1 } },
      },
      no_proof: {
        hits: [
          { claim_id: "C1", severity: "high", evidence: "" },
          { claim_id: "C1", severity: "high", evidence: "" },
        ],
        summary: { hit_count: 2, by_severity: { high: 2, medium: 0, low: 0 } },
      },
    },
  });
  assert.equal(out.top_concerns[0].sin_id, "no_proof");
  assert.equal(out.top_concerns[1].sin_id, "vagueness");
});

test("aggregate: document GRI computed from per-claim means", () => {
  const perClaim = [
    {
      claim_id: "C1", text: "x",
      features: mkFeatures({ vague: 5, green: 2 }),  // high text_risk
      structure: null,
      certifications: { certifications: [], false_label_signals: [] },
    },
    {
      claim_id: "C2", text: "y",
      features: mkFeatures({ action: 1, quantified: true }),  // low text_risk
      structure: {
        metric: { value: 33, unit: "%" },
        scope: { ghg_scope: [1, 2] },
        baseline: { reference_year: 2017 },
        time_horizon: null,
      },
      certifications: {
        certifications: [{ id: "iso_14064" }],
        false_label_signals: [],
      },
    },
  ];
  const out = L7.aggregate(perClaim, { contradictions: [], sins: {} });
  // GRI is some middle value, exact number depends on rounding
  assert.ok(out.document.GRI > 0 && out.document.GRI < 100);
  assert.ok(["低风险", "中低风险", "中高风险", "高风险"].includes(out.document.risk_level));
});

test("aggregate: weights export sum to 1.0", () => {
  const sum = Object.values(L7.WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.001, `weights should sum to 1.0, got ${sum}`);
});
