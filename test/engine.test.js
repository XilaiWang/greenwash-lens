const test = require("node:test");
const assert = require("node:assert/strict");

const { scoreText } = require("../src/greenwash-engine");

test("pure Chinese marketing copy with vague green promise scores high risk", () => {
  const result = scoreText("我们承诺到2030年实现碳中和，打造更绿色的未来。", {
    contextType: "marketing",
    sector: "general",
  });

  assert.equal(result.decisionMode, "green-claim-risk");
  assert.ok(result.risk >= 75);
});

test("quantified statement with third-party assurance scores low risk", () => {
  const result = scoreText(
    "In 2024, we reduced Scope 1 and 2 carbon emissions by 27% versus our 2021 sustainability baseline, and the climate data was independently assured by a third-party auditor.",
    {
      contextType: "report",
      sector: "general",
    },
  );

  assert.equal(result.decisionMode, "green-claim-risk");
  assert.ok(result.risk < 28);
});

test("non-green text returns baseline score", () => {
  const result = scoreText("This quarter our customer support satisfaction improved across all regions.", {
    contextType: "marketing",
    sector: "general",
  });

  assert.equal(result.decisionMode, "non-green-claim-baseline");
  assert.equal(result.risk, 8);
});

test("short green text under 10 words does not trigger false positive", () => {
  const result = scoreText("Green eco future promise", {
    contextType: "marketing",
    sector: "general",
  });

  assert.equal(result.decisionMode, "non-green-claim-baseline");
  assert.equal(result.risk, 8);
});
