const test = require("node:test");
const assert = require("node:assert/strict");

const L0 = require("../src/layers/L0-preprocess");

// L0 with no LLM key configured (default in test env) takes the
// fallback-deterministic path. That path is what we can assert against
// without mocking the network. The LLM path is exercised separately by
// a smoke test that you can opt into with REAL_LLM=1 (see bottom).

test("normalizeText collapses whitespace and trims", () => {
  const out = L0._normalizeText("  hello   world\r\nfoo \n\n\n\nbar  ");
  assert.equal(out, "hello world\nfoo\n\nbar");
});

test("splitParagraphs splits on blank lines", () => {
  const ps = L0._splitParagraphs("para 1.\n\npara 2.\n\n\npara 3.");
  assert.deepEqual(ps, ["para 1.", "para 2.", "para 3."]);
});

test("splitSentences handles English and Chinese punctuation", () => {
  const s = L0._splitSentences("Hello. World! How are you?这是中文。还有这一句！");
  assert.ok(s.length >= 4, `got ${s.length} sentences: ${JSON.stringify(s)}`);
  assert.ok(s.some((x) => x.includes("这是中文")));
});

test("detectLanguage classifies en / zh / mixed", () => {
  assert.equal(L0._detectLanguage("All English here."), "en");
  assert.equal(L0._detectLanguage("全中文内容"), "zh");
  assert.equal(L0._detectLanguage("Scope 1 范围一 base 基准 net zero 净零 plan 计划"), "mixed");
  assert.equal(L0._detectLanguage(""), "unknown");
});

test("locateClaim finds exact substring spans", () => {
  const text = "We aim to reach net zero by 2030. Scope 1 emissions are down 33%.";
  const span = L0._locateClaim(text, "Scope 1 emissions are down 33%.");
  assert.deepEqual(span, { start: text.indexOf("Scope 1"), end: text.length });
  assert.equal(L0._locateClaim(text, "not in there"), null);
});

test("fallbackSplit emits one claim per sentence with paragraph_idx", () => {
  const text = "First sentence. Second sentence.\n\nNew paragraph here. Another one.";
  const claims = L0._fallbackSplit(text);
  assert.equal(claims.length, 4);
  assert.equal(claims[0].paragraph_idx, 0);
  assert.equal(claims[1].paragraph_idx, 0);
  assert.equal(claims[2].paragraph_idx, 1);
  assert.equal(claims[3].paragraph_idx, 1);
  // Spans should be sequential and resolvable
  for (const c of claims) {
    assert.ok(c.span && typeof c.span.start === "number");
    assert.equal(text.slice(c.span.start, c.span.end), c.text);
  }
});

test("fallbackSplit drops sentences shorter than 5 chars", () => {
  const text = "Ok. Real sentence with content here.";
  const claims = L0._fallbackSplit(text);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].text, "Real sentence with content here.");
});

test("fallbackSplit flags has_data when sentence contains digits", () => {
  const claims = L0._fallbackSplit(
    "We aim to do great things. Emissions fell 33% in 2024.",
  );
  assert.equal(claims[0].has_data, false);
  assert.equal(claims[1].has_data, true);
});

test("preprocess() returns empty claims for empty input", async () => {
  const out = await L0.preprocess("");
  assert.deepEqual(out.claims, []);
  assert.equal(out.source, "fallback-deterministic");
  assert.equal(out.meta.paragraphCount, 0);
});

test("preprocess() forced to fallback mode uses sentence splitter", async () => {
  const text = "We reduced emissions by 33%. Net zero by 2030 is our target.";
  const out = await L0.preprocess(text, { forceMode: "fallback" });
  assert.equal(out.source, "fallback-deterministic");
  assert.ok(out.claims.length >= 2);
  // Spans should resolve back to the original text
  for (const c of out.claims) {
    if (c.span) {
      assert.equal(text.slice(c.span.start, c.span.end), c.text);
    }
  }
});

test("preprocess() without LLM key still produces claims via fallback", async () => {
  // Without an API key getServiceStatus.enabled is false so extractAtomicClaims
  // returns null and we drop to fallbackSplit. This guarantees the pipeline
  // always emits something — never crashes a request because LLM is down.
  if (process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY ||
      process.env.CLAUDE_API_KEY || process.env.GEMINI_API_KEY) {
    // Skip when a real key is in env (would take real network).
    return;
  }
  const out = await L0.preprocess("Sentence one. Sentence two with 50% data.");
  assert.equal(out.source, "fallback-deterministic");
  assert.equal(out.claims.length, 2);
  assert.equal(out.claims[1].has_data, true);
});

test("preprocess() output claims carry expected fields", async () => {
  const out = await L0.preprocess(
    "We achieved 33% Scope 1 reduction. We will reach net zero by 2030.",
    { forceMode: "fallback" },
  );
  for (const c of out.claims) {
    assert.equal(typeof c.claim_id, "string");
    assert.equal(typeof c.text, "string");
    assert.ok(c.span === null || (typeof c.span.start === "number"));
    assert.ok(c.paragraph_idx === null || typeof c.paragraph_idx === "number");
    assert.ok(["achievement", "commitment", "vision", "disclosure", "process"]
      .includes(c.claim_type));
    assert.equal(typeof c.has_data, "boolean");
    assert.ok(["en", "zh", "mixed", "unknown"].includes(c.language));
  }
});
