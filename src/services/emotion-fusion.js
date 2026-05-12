function fuseEmotionScores({ ruleResult, nlpResult, llmResult }) {
  const ruleScore = ruleResult?.components?.emotional ?? 0;
  const ruleNorm = (ruleScore / 30) * 100;

  let nlpScore = null;
  let nlpAvailable = false;
  if (nlpResult && !nlpResult.error) {
    nlpAvailable = true;
    const sentimentMap = { opportunity: 70, neutral: 30, risk: 15 };
    const sentimentScore = sentimentMap[nlpResult.climateSentiment] ?? 30;
    const specificityPenalty = (1 - (nlpResult.specificityScore ?? 0.5)) * 40;
    nlpScore = Math.min(
      100,
      (nlpResult.emotionScore ?? 0) * 0.5 + sentimentScore * 0.3 + specificityPenalty * 0.2,
    );
  }

  let llmScore = null;
  if (llmResult?.emotionAnalysis) {
    llmScore = llmResult.emotionAnalysis.score ?? null;
  }

  const weights = nlpAvailable
    ? { rule: 0.2, nlp: 0.45, llm: 0.35 }
    : { rule: 0.35, nlp: 0, llm: 0.65 };

  const components = [
    { score: ruleNorm, weight: weights.rule },
    nlpAvailable ? { score: nlpScore, weight: weights.nlp } : null,
    llmScore !== null ? { score: llmScore, weight: weights.llm } : null,
  ].filter(Boolean);

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const finalScore = Math.round(
    components.reduce((sum, component) => sum + component.score * component.weight, 0) /
      totalWeight,
  );

  const scores = components.map((component) => component.score);
  const variance =
    scores.length > 1
      ? scores.reduce((sum, value) => sum + Math.pow(value - finalScore, 2), 0) / scores.length
      : 2500;
  const consistency = Math.max(0, 1 - variance / 2500);

  return {
    finalScore,
    level:
      finalScore >= 71 ? "high" : finalScore >= 46 ? "medium" : finalScore >= 21 ? "low" : "none",
    consistency: Math.round(consistency * 100),
    layersUsed: components.length,
    breakdown: {
      rule: Math.round(ruleNorm),
      nlp: nlpAvailable ? Math.round(nlpScore) : null,
      llm: llmScore !== null ? Math.round(llmScore) : null,
    },
    nlpDetail: nlpAvailable
      ? {
          climateSentiment: nlpResult.climateSentiment,
          sentimentConfidence: nlpResult.sentimentConfidence,
          isCommitment: nlpResult.isCommitment,
          commitmentType: nlpResult.commitmentType,
          specificityScore: nlpResult.specificityScore,
        }
      : null,
  };
}

module.exports = {
  fuseEmotionScores,
};
