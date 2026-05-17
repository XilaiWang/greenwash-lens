const test = require("node:test");
const assert = require("node:assert/strict");

const L5a = require("../src/layers/L5a-certifications");

test("certifications.yaml loads and entries compile", () => {
  const { entries } = L5a.loadCertifications();
  assert.ok(entries.length >= 30, `expected ≥30 cert entries, got ${entries.length}`);
  for (const c of entries) {
    assert.equal(typeof c.id, "string");
    assert.ok(c._re instanceof RegExp);
    assert.ok(["process", "product", "management_system", "reporting_framework",
      "assurance", "initiative", "unknown"].includes(c.type));
  }
});

test("verifyOne detects ISO 14064 mention", () => {
  const r = L5a.verifyOne({ text: "Audited per ISO 14064-1 for our Scope 1+2 inventory." });
  assert.ok(r.certifications.some((c) => c.id === "iso_14064"));
  assert.equal(r.summary.recognized_count >= 1, true);
});

test("verifyOne detects multiple certs in one claim", () => {
  const r = L5a.verifyOne({
    text: "Reported per GRI Standards and verified to ISAE 3000 by KPMG; SBTi-aligned target.",
  });
  const ids = r.certifications.map((c) => c.id);
  assert.ok(ids.includes("gri"));
  assert.ok(ids.includes("isae_3000"));
  assert.ok(ids.includes("sbti"));
});

test("verifyOne detects Chinese cert name (ISO 14001)", () => {
  const r = L5a.verifyOne({ text: "工厂通过 ISO 14001 环境管理体系认证。" });
  assert.ok(r.certifications.some((c) => c.id === "iso_14001"));
});

test("verifyOne flags self-certified as high severity false-label signal", () => {
  const r = L5a.verifyOne({
    text: "All our products meet our own environmental standard — self-certified to be 100% sustainable.",
  });
  const signals = r.false_label_signals.map((s) => s.signal);
  assert.ok(signals.includes("self_certified"), "missing self_certified signal");
  const sc = r.false_label_signals.find((s) => s.signal === "self_certified");
  assert.equal(sc.severity, "high");
});

test("verifyOne flags vague 'certified' without authority as low signal", () => {
  const r = L5a.verifyOne({ text: "Our packaging is certified sustainable." });
  const signals = r.false_label_signals.map((s) => s.signal);
  assert.ok(signals.includes("vague_certification_claim"));
});

test("verifyOne does NOT flag 'certified by/to' phrasing as false label", () => {
  const r = L5a.verifyOne({ text: "Certified by FSC under the FSC Chain of Custody standard." });
  const signals = r.false_label_signals.map((s) => s.signal);
  // "certified by FSC" should NOT trigger vague_certification_claim
  assert.equal(signals.includes("vague_certification_claim"), false);
  // And should pick up FSC
  assert.ok(r.certifications.some((c) => c.id === "fsc"));
});

test("verifyOne returns empty result for empty text", () => {
  const r = L5a.verifyOne({ text: "" });
  assert.deepEqual(r.certifications, []);
  assert.deepEqual(r.false_label_signals, []);
  assert.equal(r.summary.recognized_count, 0);
});

test("verifyOne accepts plain string input", () => {
  const r = L5a.verifyOne("Validated by SBTi.");
  assert.ok(r.certifications.some((c) => c.id === "sbti"));
});

test("verifyOne folds in evidence_cited from Layer 3 when not in registry", () => {
  const r = L5a.verifyOne({
    text: "Audited by SmallLocalCert Co. (no official registry)",
    structure: {
      evidence_cited: [{ type: "audit", name: "SmallLocalCert Co.", identifier: null }],
    },
  });
  // Should still surface as a cert (with id=null) so the UI can show it
  // and downstream layers know there's some named evidence even if we
  // can't validate it.
  assert.ok(r.certifications.length >= 1);
  const unknown = r.certifications.find((c) => c.id === null);
  assert.ok(unknown, "evidence_cited should add an unknown-source entry");
});

test("verifyAll preserves order and produces one result per claim", () => {
  const claims = [
    { text: "ISO 14001 management system." },
    { text: "Self-certified to our own standard." },
    { text: "No cert mentioned here." },
  ];
  const results = L5a.verifyAll(claims);
  assert.equal(results.length, 3);
  assert.equal(results[0].summary.recognized_count, 1);
  assert.equal(results[1].summary.suspicious_count >= 1, true);
  assert.equal(results[2].summary.recognized_count, 0);
});
