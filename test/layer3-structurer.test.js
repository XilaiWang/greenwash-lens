const test = require("node:test");
const assert = require("node:assert/strict");

const L3 = require("../src/layers/L3-structurer");

// Tests exercise the deterministic fallback path. LLM path requires a
// configured provider; smoke-test it manually via the orchestrator end-to-end.

test("detectGhgScope handles English 'Scope 1' / 'Scope 2'", () => {
  assert.deepEqual(L3._detectGhgScope("Scope 1 and Scope 2 emissions"), [1, 2]);
  assert.deepEqual(L3._detectGhgScope("Scope 3 supply chain only"), [3]);
});

test("detectGhgScope handles Chinese 范围一/二/三", () => {
  assert.deepEqual(L3._detectGhgScope("范围一 和 范围二 排放"), [1, 2]);
  assert.deepEqual(L3._detectGhgScope("范围 1、范围 2、范围 3"), [1, 2, 3]);
});

test("detectGhgScope returns null when no scope mentioned", () => {
  assert.equal(L3._detectGhgScope("We reduced emissions by 33%"), null);
});

test("fallbackStructure parses metric, target year, baseline year", () => {
  const s = L3._fallbackStructure({
    text: "Scope 1 and Scope 2 emissions reduced by 33% vs 2017 baseline by 2030.",
    claim_type: "performance",
  });
  assert.equal(s.claim_type, "performance");
  assert.deepEqual(s.metric, { name: null, value: 33, unit: "%" });
  assert.deepEqual(s.scope.ghg_scope, [1, 2]);
  assert.equal(s.scope.boundary, "unknown");
  assert.equal(s.baseline.reference_year, 2017);
  assert.equal(s.time_horizon.target_year, 2030);
  assert.equal(s.confidence, 0.4, "fallback should declare low confidence");
});

test("fallbackStructure infers commitment from future tense + target year", () => {
  const s = L3._fallbackStructure({
    text: "We will reach net zero by 2030.",
  });
  assert.equal(s.claim_type, "commitment");
  assert.equal(s.time_horizon.target_year, 2030);
});

test("fallbackStructure leaves metric null when no number present", () => {
  const s = L3._fallbackStructure({ text: "Our supplier code covers all sites." });
  assert.equal(s.metric, null);
  assert.equal(s.baseline, null);
  assert.equal(s.time_horizon, null);
});

test("structureOne with forceMode=fallback returns regex-derived stub", async () => {
  const out = await L3.structureOne(
    { text: "We achieved 50% renewable electricity by 2024." },
    { forceMode: "fallback" },
  );
  assert.equal(out.source, "fallback-regex");
  assert.equal(out.metric.value, 50);
  assert.equal(out.time_horizon.target_year, 2024);
});

test("structureOne without LLM key falls back gracefully", async () => {
  // Without provider configured, the LLM call returns null and we drop to
  // the fallback path. This guarantees the orchestrator never blocks on
  // an unconfigured LLM — Layer 3 always produces something.
  if (process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY ||
      process.env.CLAUDE_API_KEY || process.env.GEMINI_API_KEY) {
    return;
  }
  const out = await L3.structureOne({
    text: "Scope 1 emissions cut by 33% vs 2017 by 2030.",
  });
  assert.equal(out.source, "fallback-regex");
  assert.deepEqual(out.scope.ghg_scope, [1]);
});

test("structureAll preserves input order with concurrency=5", async () => {
  const claims = [
    { text: "Claim A with 10% reduction." },
    { text: "Claim B with 20% reduction." },
    { text: "Claim C with 30% reduction by 2030." },
    { text: "Claim D no data." },
    { text: "Claim E with 50% by 2025." },
  ];
  const out = await L3.structureAll(claims, { forceMode: "fallback" });
  assert.equal(out.length, 5);
  assert.equal(out[0].metric.value, 10);
  assert.equal(out[1].metric.value, 20);
  assert.equal(out[2].metric.value, 30);
  assert.equal(out[3].metric, null);
  assert.equal(out[4].metric.value, 50);
});

test("structureOne handles empty input safely", async () => {
  const out = await L3.structureOne({ text: "" }, { forceMode: "fallback" });
  assert.equal(out.claim_text, "");
  assert.equal(out.source, "fallback-regex");
});
