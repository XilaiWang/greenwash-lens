const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Layer 8 feedback storage tests. Use a temp data dir so we don't
// touch the developer's real history.sqlite.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "greenwashing-feedback-test-"));
process.env.GREENWASH_USER_DATA_DIR = tmpDir;

const {
  addHistoryItem,
  addFeedback,
  exportFeedbackJsonl,
  readHistory,
  createHistoryItem,
} = require("../src/history-store");

async function seed(id, text) {
  // createHistoryItem expects flat fields, not a nested request object.
  const item = createHistoryItem({
    text,
    contextType: "auto",
    sector: "auto",
    result: { risk: 50 },
    llm: null,
    verification: null,
    classification: null,
    meta: null,
  });
  item.id = id; // override auto id for test determinism
  await addHistoryItem(item);
  return item;
}

test("addFeedback writes feedback_json + feedback_at on existing row", async () => {
  await seed("test-id-1", "We aim to lead the sustainable future.");
  const result = await addFeedback("test-id-1", {
    reviewer: "alice",
    overall: "agree",
    per_claim: [{ claim_id: "L0-001", correct: true }],
    note: "Looks fine",
  });
  assert.equal(result.updated, true);

  const rows = await readHistory(10);
  const row = rows.find((r) => r.id === "test-id-1");
  assert.ok(row, "test row should be present");
  assert.ok(row.feedback, "feedback should be persisted");
  assert.equal(row.feedback.reviewer, "alice");
  assert.equal(row.feedback.overall, "agree");
  assert.equal(typeof row.feedbackAt, "string");
});

test("addFeedback throws 404 for non-existent id", async () => {
  await assert.rejects(
    () => addFeedback("does-not-exist", { reviewer: "bob" }),
    (err) => {
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test("addFeedback rejects empty id / non-object feedback", async () => {
  await assert.rejects(() => addFeedback("", { reviewer: "x" }), /non-empty string/);
  await assert.rejects(() => addFeedback("test-id-1", null), /must be an object/);
});

test("addFeedback overwrites previous feedback on same id (latest wins)", async () => {
  await seed("test-id-2", "Vague green claim.");
  await addFeedback("test-id-2", { reviewer: "first", overall: "agree" });
  await addFeedback("test-id-2", { reviewer: "second", overall: "disagree" });

  const rows = await readHistory(10);
  const row = rows.find((r) => r.id === "test-id-2");
  assert.equal(row.feedback.reviewer, "second");
  assert.equal(row.feedback.overall, "disagree");
});

test("exportFeedbackJsonl returns one line per labelled row", async () => {
  // After the above tests, two rows have feedback. Export should
  // include both, regardless of insertion order.
  const jsonl = exportFeedbackJsonl();
  const lines = jsonl.split("\n").filter(Boolean);
  assert.ok(lines.length >= 2);
  const objects = lines.map((l) => JSON.parse(l));
  for (const o of objects) {
    assert.ok(o.feedback, "every exported row should carry feedback");
    assert.ok(o.id);
    assert.ok(o.request);
  }
});

test("exportFeedbackJsonl skips rows without feedback", async () => {
  await seed("test-id-no-feedback", "no feedback here");
  const jsonl = exportFeedbackJsonl();
  const lines = jsonl.split("\n").filter(Boolean);
  const ids = lines.map((l) => JSON.parse(l).id);
  assert.equal(ids.includes("test-id-no-feedback"), false);
});

test("readHistory returns feedback + feedbackAt on labelled rows", async () => {
  const rows = await readHistory(50);
  const labelled = rows.find((r) => r.id === "test-id-1");
  assert.ok(labelled.feedbackAt);
  assert.ok(labelled.feedback);
});
