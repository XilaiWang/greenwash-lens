const test = require("node:test");
const assert = require("node:assert/strict");

const { extractDocumentMetadata } = require("../src/services/llm-service");

// These tests exercise the filename heuristic fallback (LLM not configured).
// The LLM path is exercised via the live /api/v2/extract-metadata endpoint
// when a provider key is available.

test("metadata fallback: filename with company-year-suffix pattern", async () => {
  const r = await extractDocumentMetadata({
    text: "",
    filename: "Marks-and-Spencer-Group-plc-Annual-Report-and-Financial-Statements-2025_INTERACTIVE_FINAL-2.pdf",
  });
  assert.equal(r.year, 2025);
  assert.ok(r.company.toLowerCase().startsWith("marks and spencer"),
    `expected company to start with 'Marks and Spencer', got: ${r.company}`);
});

test("metadata fallback: filename with year only", async () => {
  const r = await extractDocumentMetadata({ text: "", filename: "ESG_Report_2024.pdf" });
  assert.equal(r.year, 2024);
  assert.equal(typeof r.company, "string");
});

test("metadata fallback: no year detectable returns null year", async () => {
  const r = await extractDocumentMetadata({ text: "", filename: "untitled.pdf" });
  assert.equal(r.year, null);
});

test("metadata fallback: empty input returns nulls", async () => {
  const r = await extractDocumentMetadata({ text: "", filename: "" });
  assert.equal(r.company, null);
  assert.equal(r.year, null);
  assert.equal(r.report_type, "esg_report");
});

test("metadata fallback: source field reflects path taken", async () => {
  const r = await extractDocumentMetadata({ text: "", filename: "Apple_2024.pdf" });
  // No LLM key in default test env → filename-no-llm
  assert.ok(["filename", "filename-no-llm"].includes(r.source));
});
