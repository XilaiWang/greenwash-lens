const { ENGINE_VERSION, scoreText } = require("../greenwashing-engine");
const { classifyText } = require("../text-classifier");
const { classifyWithLLM, enrichAnalysis, getServiceStatus } = require("./llm-service");
const { callNlpService, NLP_SERVICE_URL } = require("./nlp-service-client");
const { fuseEmotionScores } = require("./emotion-fusion");
const { addHistoryItem, createHistoryItem } = require("../history-store");
const { buildVerification } = require("../verification-service");

async function analyzeText({
  text,
  contextType = "auto",
  sector = "auto",
  save = true,
  onProgress,
}) {
  const clean = String(text || "").trim();

  if (!clean) {
    const error = new Error("请提供需要分析的文本。");
    error.statusCode = 400;
    throw error;
  }

  onProgress?.({
    stage: "classifying",
    progress: 14,
    message: "正在识别语言、文本场景和行业。",
  });
  let classification = classifyText(clean, { contextType, sector });

  if (contextType === "auto" || sector === "auto") {
    onProgress?.({
      stage: "llm_classify",
      progress: 24,
      message: "正在请求外部模型辅助分类。",
    });
    const llmClassify = await classifyWithLLM(clean);
    if (llmClassify) {
      classification = mergeClassification(classification, llmClassify, {
        contextType,
        sector,
      });
    }
  }

  onProgress?.({
    stage: "scoring",
    progress: 38,
    message: "正在运行本地规则引擎。",
  });
  const result = scoreText(clean, {
    contextType: classification.context.selected,
    sector: classification.sector.selected,
    classification,
  });

  onProgress?.({
    stage: "scoring",
    progress: 52,
    message: "本地规则结果已就绪，正在校验可信度。",
    partial: {
      result,
      classification,
      llm: {
        enabled: false,
        provider: getServiceStatus().provider,
        model: getServiceStatus().model,
        summary: "外部模型增强尚未完成，当前显示的是本地规则结果。",
        annotations: [],
        error: null,
      },
    },
  });

  onProgress?.({
    stage: "nlp-local",
    progress: 58,
    message: "正在运行本地 NLP 情绪模型。",
  });
  const nlpResultPromise = callNlpService(clean, classification.language.value).catch(() => null);

  const llmStatus = getServiceStatus();
  onProgress?.({
    stage: "llm",
    progress: llmStatus.enabled ? 68 : 76,
    message: llmStatus.enabled
      ? `正在请求 ${llmStatus.provider} 外部模型补充判断。`
      : "外部模型未启用，跳过增强判断。",
  });
  const llm = await enrichAnalysis({
    text: clean,
    classification,
    result,
  });
  const nlpResult = await nlpResultPromise;
  if (!nlpResult) {
    onProgress?.({
      stage: "nlp-skip",
      progress: 76,
      message: "本地 NLP 服务未启动，跳过情绪模型。",
    });
  }
  const emotionAnalysis = fuseEmotionScores({
    ruleResult: result,
    nlpResult,
    llmResult: llm,
  });
  const resultWithEmotion = {
    ...result,
    emotionAnalysis,
  };
  onProgress?.({
    stage: "saving",
    progress: 86,
    message: "正在校验自动识别和外部模型结果。",
  });
  const verification = buildVerification({
    text: clean,
    classification,
    result,
    llm,
  });
  const meta = {
    app: "greenwashing-lens",
    apiVersion: "v1",
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    llmService: getServiceStatus(),
    nlpService: {
      available: Boolean(nlpResult && !nlpResult.error),
      url: NLP_SERVICE_URL,
    },
  };
  onProgress?.({
    stage: "saving",
    progress: save ? 94 : 97,
    message: save ? "正在保存分析历史。" : "跳过历史保存，整理最终结果。",
    partial: {
      result: resultWithEmotion,
      classification,
      llm,
      emotionAnalysis,
      verification,
      meta,
    },
  });
  const historyItem = createHistoryItem({
    text: clean,
    contextType: classification.context.selected,
    sector: classification.sector.selected,
    result: resultWithEmotion,
    llm,
    emotionAnalysis,
    meta,
    verification,
    classification,
  });

  if (save) {
    await addHistoryItem(historyItem);
  }

  onProgress?.({
    stage: "completed",
    progress: 100,
    message: "分析完成。",
    partial: {
      result: resultWithEmotion,
      classification,
      llm,
      emotionAnalysis,
      verification,
      meta,
      historyItem,
    },
  });

  return {
    result: resultWithEmotion,
    classification,
    llm,
    emotionAnalysis,
    verification,
    meta,
    historyItem,
  };
}

function mergeClassification(keywordClass, llmResult, overrides) {
  const { CONTEXT_LABELS, SECTOR_LABELS } = require("../text-classifier");

  return {
    ...keywordClass,
    classificationMethod: {
      context: llmResult.contextType ? "llm" : "keyword",
      sector: llmResult.sector ? "llm" : "keyword",
    },
    context: buildClassPart(
      keywordClass.context,
      llmResult.contextType,
      overrides.contextType,
      CONTEXT_LABELS,
    ),
    sector: buildClassPart(
      keywordClass.sector,
      llmResult.sector,
      overrides.sector,
      SECTOR_LABELS,
    ),
    llmClassify: {
      contextType: llmResult.contextType,
      sector: llmResult.sector,
      confidence: llmResult.confidence,
      reasoning: llmResult.reasoning,
    },
  };
}

function buildClassPart(keywordPart, llmValue, overrideValue, labels) {
  if (overrideValue && overrideValue !== "auto" && labels[overrideValue]) {
    return keywordPart;
  }

  if (llmValue && labels[llmValue]) {
    return {
      detected: keywordPart.detected,
      selected: llmValue,
      source: "llm",
      label: labels[llmValue],
    };
  }

  return keywordPart;
}

module.exports = {
  analyzeText,
};
