const test = require("node:test");
const assert = require("node:assert/strict");

const { scoreText } = require("../src/greenwash-engine");
const { fuseEmotionScores } = require("../src/services/emotion-fusion");

test("rule layer exposes an emotional component for emotionally loaded claims", () => {
  const result = scoreText(
    "We are building a sustainable future for the next generation and protecting the planet together.",
    {
      contextType: "marketing",
      sector: "general",
      classification: {
        language: { value: "en" },
        context: { selected: "marketing" },
        sector: { selected: "general" },
      },
    },
  );

  assert.ok(result.components.emotional > 0);
});

test("emotion fusion uses all three layers when NLP is available", () => {
  const fused = fuseEmotionScores({
    ruleResult: { components: { emotional: 12 } },
    nlpResult: {
      climateSentiment: "opportunity",
      sentimentConfidence: 0.9,
      isCommitment: true,
      commitmentType: "commitment",
      specificityScore: 0.2,
      emotionScore: 70,
    },
    llmResult: {
      emotionAnalysis: { score: 40 },
    },
  });

  assert.equal(fused.layersUsed, 3);
  assert.equal(fused.breakdown.rule, 40);
  assert.ok(fused.breakdown.nlp !== null);
  assert.equal(fused.breakdown.llm, 40);
});

test("emotion fusion falls back to rule and llm when NLP is unavailable", () => {
  const fused = fuseEmotionScores({
    ruleResult: { components: { emotional: 9 } },
    nlpResult: null,
    llmResult: {
      emotionAnalysis: { score: 50 },
    },
  });

  assert.equal(fused.layersUsed, 2);
  assert.equal(fused.breakdown.rule, 30);
  assert.equal(fused.breakdown.nlp, null);
  assert.equal(fused.breakdown.llm, 50);
  assert.equal(fused.finalScore, 43);
});
