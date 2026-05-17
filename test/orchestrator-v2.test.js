const test = require("node:test");
const assert = require("node:assert/strict");

const { analyze, VALID_MODES } = require("../src/layers/orchestrator");

test("orchestrator: empty text returns empty payload, no stages run", async () => {
  const out = await analyze("");
  assert.equal(out.apiVersion, "v2");
  assert.equal(out.document.text_length, 0);
  assert.equal(out.document.language, "unknown");
  assert.equal(out.document.claim_count, 0);
  assert.deepEqual(out.perClaim, []);
  assert.deepEqual(out.meta.stages_run, []);
});

test("orchestrator: fast mode runs L0 + L1, skips L3", async () => {
  const text = "We reduced Scope 1 emissions by 33% by 2024. Net zero by 2030 is our target.";
  const out = await analyze(text, { mode: "fast", forceMode: "fallback" });
  assert.deepEqual(out.meta.stages_run, ["L0", "L1"]);
  assert.ok(out.perClaim.length >= 2);
  for (const c of out.perClaim) {
    assert.ok(c.features, "every claim should carry a feature vector");
    assert.equal(c.structure, null, "fast mode should not emit structure");
  }
  assert.ok(typeof out.meta.elapsed_ms.L0 === "number");
  assert.ok(typeof out.meta.elapsed_ms.L1 === "number");
  assert.equal("L3" in out.meta.elapsed_ms, false);
});

test("orchestrator: standard mode runs L0 + L1 + L3 (fallback path)", async () => {
  const text = "Scope 1+2 emissions cut by 33% vs 2017 by 2030.";
  const out = await analyze(text, { mode: "standard", forceMode: "fallback" });
  assert.deepEqual(out.meta.stages_run, ["L0", "L1", "L3"]);
  for (const c of out.perClaim) {
    assert.ok(c.features, "feature vector required");
    assert.ok(c.structure, "structure required in standard mode");
    assert.ok(typeof c.structure.confidence === "number");
  }
});

test("orchestrator: invalid mode falls back to fast", async () => {
  const out = await analyze("Test text.", { mode: "bogus" });
  assert.equal(out.mode, "fast");
});

test("orchestrator: per-claim payload carries L0 fields", async () => {
  const text = "We achieved 50% renewable electricity. We will reach 100% by 2030.";
  const out = await analyze(text, { mode: "fast", forceMode: "fallback" });
  for (const c of out.perClaim) {
    assert.equal(typeof c.claim_id, "string");
    assert.equal(typeof c.text, "string");
    assert.ok(c.span === null || typeof c.span.start === "number");
    assert.ok(c.paragraph_idx === null || typeof c.paragraph_idx === "number");
    assert.ok(["en", "zh", "mixed", "unknown"].includes(c.language));
  }
});

test("orchestrator: per-claim features come from Layer 1 dictionaries", async () => {
  const out = await analyze(
    "We aim to be a leading carbon neutral retailer by 2050.",
    { mode: "fast", forceMode: "fallback" },
  );
  // First claim should hit absolute (carbon neutral), vague (aim, leading),
  // future (by 2050)
  const first = out.perClaim[0];
  assert.ok(first.features.categories.absolute.count >= 1);
  assert.ok(first.features.categories.vague.count >= 1);
  assert.equal(first.features.regex.timeline, true);
});

test("orchestrator: standard mode L3 fallback emits scope/metric/year for clear claims", async () => {
  const out = await analyze(
    "Scope 1 emissions cut by 33% vs 2017 by 2030.",
    { mode: "standard", forceMode: "fallback" },
  );
  const c = out.perClaim[0];
  assert.deepEqual(c.structure.scope.ghg_scope, [1]);
  assert.equal(c.structure.metric.value, 33);
  assert.equal(c.structure.baseline.reference_year, 2017);
  assert.equal(c.structure.time_horizon.target_year, 2030);
});

test("orchestrator: VALID_MODES exported and contains fast + standard + comprehensive", () => {
  assert.ok(VALID_MODES.includes("fast"));
  assert.ok(VALID_MODES.includes("standard"));
  assert.ok(VALID_MODES.includes("comprehensive"));
});

test("orchestrator: comprehensive mode runs L5a + L6 + L7", async () => {
  const text = "Our eco-friendly products are self-certified to our own 100% sustainable standard.";
  const out = await analyze(text, { mode: "comprehensive", forceMode: "fallback" });
  assert.deepEqual(out.meta.stages_run, ["L0", "L1", "L3", "L5a", "L6", "L7"]);
  assert.ok(out.consistency, "consistency block should be populated in comprehensive mode");
  // self-certified should land in false_labels sin
  assert.ok(out.consistency.sins.false_labels, "false_labels sin should be flagged");
  // Each claim should have certifications attached
  for (const c of out.perClaim) {
    assert.ok(c.certifications, "every claim should carry L5a output");
    assert.ok(typeof c.certifications.summary === "object");
  }
});

test("orchestrator: comprehensive mode produces sin hits for vague green claim", async () => {
  const text = "We strive to lead our journey toward a greener, more sustainable future.";
  const out = await analyze(text, { mode: "comprehensive", forceMode: "fallback" });
  // Vague language + green claim + no proof → vagueness + no_proof sins
  const sinIds = Object.keys(out.consistency.sins);
  assert.ok(sinIds.includes("vagueness") || sinIds.includes("no_proof"),
    `expected vagueness or no_proof in ${JSON.stringify(sinIds)}`);
});

test("orchestrator: comprehensive mode detects ISO 14064 cert mention", async () => {
  const text = "Our Scope 1 emissions are audited annually per ISO 14064-1 by an independent assurer.";
  const out = await analyze(text, { mode: "comprehensive", forceMode: "fallback" });
  const allCerts = out.perClaim.flatMap((c) => c.certifications?.certifications || []);
  assert.ok(allCerts.some((c) => c.id === "iso_14064"), "should detect ISO 14064");
  // With a cert recognized + proof terms, no_proof sin should NOT trigger
  assert.equal(out.consistency.sins.no_proof, undefined);
});

test("orchestrator: comprehensive mode runs L7 and produces document GRI", async () => {
  const text = "We strive to lead a greener future. We are 100% sustainable.";
  const out = await analyze(text, { mode: "comprehensive", forceMode: "fallback" });
  assert.deepEqual(out.meta.stages_run, ["L0", "L1", "L3", "L5a", "L6", "L7"]);
  assert.ok(out.scoring, "scoring block should be populated");
  assert.ok(out.scoring.document, "document scoring required");
  assert.ok(typeof out.scoring.document.GRI === "number");
  assert.ok(["低风险", "中低风险", "中高风险", "高风险"]
    .includes(out.scoring.document.risk_level));
  // Per-claim should also carry risk
  for (const c of out.perClaim) {
    assert.ok(c.risk, "every claim should carry L7 risk attached");
    assert.ok(typeof c.risk.claim_risk === "number");
    assert.ok(Array.isArray(c.risk.sins));
  }
});

test("orchestrator: L7 document GRI is HIGHER for clearly bad claim than for clean one", async () => {
  const bad = await analyze(
    "We strive to lead our greener journey. Self-certified to our own standard.",
    { mode: "comprehensive", forceMode: "fallback" },
  );
  const good = await analyze(
    "Scope 1+2 emissions reduced 33% vs 2017 baseline, audited per ISO 14064-1.",
    { mode: "comprehensive", forceMode: "fallback" },
  );
  assert.ok(
    bad.scoring.document.GRI > good.scoring.document.GRI,
    `bad GRI ${bad.scoring.document.GRI} should exceed good GRI ${good.scoring.document.GRI}`,
  );
});

test("orchestrator: top_concerns lists sins in descending weighted severity", async () => {
  const text = "Self-certified to our own standard. We strive to lead our greener future.";
  const out = await analyze(text, { mode: "comprehensive", forceMode: "fallback" });
  const ranked = out.scoring.top_concerns;
  assert.ok(ranked.length >= 1);
  for (let i = 0; i + 1 < ranked.length; i++) {
    assert.ok(ranked[i].weighted_score >= ranked[i + 1].weighted_score,
      `top_concerns not sorted at index ${i}`);
  }
});
