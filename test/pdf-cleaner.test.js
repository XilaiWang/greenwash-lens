const test = require("node:test");
const assert = require("node:assert/strict");

const { cleanPdfText } = require("../src/pdf-cleaner");

test("repairs PDF reader text with letter-spaced ESG terms", () => {
  const result = cleanPdfText(
    [
      "E t h i c a l  t r a d e and E S G governance are reviewed.",
      "可 持 续 发 展 与 气 候 风 险 披 露",
    ].join("\n"),
  );

  const renderedText = JSON.stringify(result.document);

  assert.match(result.cleanedText, /Ethical trade/);
  assert.match(result.cleanedText, /ESG governance/);
  assert.match(result.cleanedText, /可持续发展与气候风险披露/);
  assert.doesNotMatch(renderedText, /E t h i c a l/);
});

test("folds PDF reference index blocks away from evidence reading", () => {
  const result = cleanPdfText(
    "Describe the organisation's processes for managing climate-related risks. Read more on pages 52-53. Describe how risks are integrated into risk management. Read more on page 41.",
  );

  const block = result.document[0];
  assert.equal(block.hiddenByDefault, true);
  assert.equal(block.hiddenReason, "reference_index");
});
