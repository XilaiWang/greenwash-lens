const { ENGINE_VERSION } = require("./greenwash-engine");
const { readJson, readRawBody, sendJson } = require("./http-utils");
const {
  classifyText,
  CONTEXT_LABELS,
  SECTOR_LABELS,
  VALID_CONTEXT_TYPES,
  VALID_SECTORS,
} = require("./text-classifier");
const {
  clearHistory,
  deleteHistoryItem,
  getStorageInfo,
  readHistory,
} = require("./history-store");
const { analyzeText } = require("./services/analysis-service");
const {
  classifyWithLLM,
  getServiceStatus,
  summarizeHistory,
  testLlmConnection,
} = require("./services/llm-service");
const { getNlpServiceStatus } = require("./services/nlp-service-client");
const { createAnalysisJob, getJob } = require("./analysis-jobs");
const { extractFromBuffer } = require("./pdf-extractor");
const { MAX_TEXT_LENGTH } = require("./pdf-cleaner");

async function handleApi(request, response, url, csrfToken) {
  const pathname = normalizeApiPath(url.pathname);

  if ((request.method === "POST" || request.method === "DELETE") &&
      request.headers["x-csrf-token"] !== csrfToken) {
    sendJson(response, 403, { error: "缺少或无效的 CSRF 令牌。" });
    return true;
  }

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      app: "greenwash-lens",
      apiVersion: "v1",
      engineVersion: ENGINE_VERSION,
      storage: getStorageInfo(),
      llmService: getServiceStatus(),
      nlpService: await getNlpServiceStatus(),
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/services") {
    sendJson(response, 200, {
      apiVersion: "v1",
      services: {
        analysis: "src/services/analysis-service.js",
        classifier: "src/text-classifier.js",
        llm: {
          adapter: "src/services/llm-service.js",
          status: getServiceStatus(),
        },
      },
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/llm/test") {
    sendJson(response, 200, await testLlmConnection());
    return true;
  }

  if (request.method === "POST" && pathname === "/classify") {
    const body = await readJson(request);
    const normalized = validateAnalysisInput(body);
    let classification = classifyText(normalized.text, {
      contextType: normalized.contextType,
      sector: normalized.sector,
    });
    const llmClassify = await classifyWithLLM(normalized.text);

    if (llmClassify) {
      classification = mergeClassification(classification, llmClassify, {
        contextType: normalized.contextType,
        sector: normalized.sector,
      });
    }

    sendJson(response, 200, {
      classification,
      method: llmClassify ? "llm" : "keyword",
      llmService: getServiceStatus(),
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/analyze") {
    const body = validateAnalysisInput(await readJson(request));
    const payload = await analyzeText({
      text: body.text,
      contextType: body.contextType,
      sector: body.sector,
      save: body.save !== false,
    });

    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "POST" && pathname === "/analyze-jobs") {
    const body = validateAnalysisInput(await readJson(request));
    const job = createAnalysisJob({
      text: body.text,
      contextType: body.contextType,
      sector: body.sector,
      save: body.save !== false,
    });

    sendJson(response, 202, job);
    return true;
  }

  if (request.method === "GET" && pathname.startsWith("/analyze-jobs/")) {
    const jobId = pathname.replace("/analyze-jobs/", "");
    const job = getJob(jobId);

    if (!job) {
      sendJson(response, 404, { error: "分析任务不存在或已过期。" });
      return true;
    }

    sendJson(response, 200, job);
    return true;
  }

  if (request.method === "GET" && pathname === "/history") {
    const limit = Number(url.searchParams.get("limit") || 30);
    const history = await readHistory(Math.max(1, Math.min(limit, 1000)));

    sendJson(response, 200, {
      items: history,
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/history/summary") {
    const history = await readHistory(50);
    const compactItems = history.map((item) => ({
      createdAt: item.createdAt,
      level: item.result?.level || null,
      risk: item.result?.risk ?? null,
      factors: item.result?.factors || [],
      sector: item.classification?.sector?.selected || item.request?.sector || "auto",
      context: item.classification?.context?.selected || item.request?.contextType || "auto",
    }));
    const summary = await summarizeHistory(compactItems);

    sendJson(response, 200, {
      summary: summary.historySummary,
    });
    return true;
  }

  if (request.method === "DELETE" && pathname === "/history") {
    await clearHistory();
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "DELETE" && pathname.startsWith("/history/")) {
    const historyId = decodeURIComponent(pathname.replace("/history/", ""));
    const deleted = await deleteHistoryItem(historyId);

    if (!deleted) {
      sendJson(response, 404, { error: "历史记录不存在。" });
      return true;
    }

    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && pathname === "/upload-pdf") {
    const pdfBuffer = await readRawBody(request);
    if (pdfBuffer.length < 4) {
      sendJson(response, 400, { error: "上传的文件不是有效 PDF。" });
      return true;
    }
    const signatureWindow = pdfBuffer
      .subarray(0, Math.min(pdfBuffer.length, 1024))
      .toString("latin1");
    if (!signatureWindow.includes("%PDF-")) {
      sendJson(response, 400, { error: "上传的文件不是有效 PDF 格式。" });
      return true;
    }
    const { text, document, engine, warnings, stats } = await extractFromBuffer(pdfBuffer);
    const responseDoc = safeDocument(document);
    sendJson(response, 200, {
      ok: true,
      text,
      document: responseDoc,
      engine,
      warnings: warnings || [],
      stats: stats || {},
      filename: request.headers["x-filename"] || null,
      size: pdfBuffer.length,
    });
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "接口不存在。" });
    return true;
  }

  return false;
}

const MAX_DOC_JSON_SIZE = 500 * 1024;

function safeDocument(doc) {
  if (!doc || !doc.length) return [];
  const json = JSON.stringify(doc);
  if (json.length <= MAX_DOC_JSON_SIZE) return doc;
  let truncated = doc;
  while (truncated.length > 1 && JSON.stringify(truncated).length > MAX_DOC_JSON_SIZE) {
    truncated = truncated.slice(0, Math.max(1, truncated.length - 1));
  }
  return truncated;
}

function normalizeApiPath(pathname) {
  return pathname.replace(/^\/api\/v1/, "").replace(/^\/api/, "") || "/";
}

function validateAnalysisInput(body) {
  const text = body?.text;

  if (typeof text !== "string" || !text.trim()) {
    const error = new Error("text 必须是非空字符串。");
    error.statusCode = 400;
    throw error;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    const error = new Error(`text 长度不能超过 ${MAX_TEXT_LENGTH} 个字符。`);
    error.statusCode = 400;
    throw error;
  }

  const contextType = normalizeEnumValue(body.contextType, VALID_CONTEXT_TYPES, "contextType");
  const sector = normalizeEnumValue(body.sector, VALID_SECTORS, "sector");

  return {
    ...body,
    text,
    contextType,
    sector,
  };
}

function normalizeEnumValue(value, allowedValues, fieldName) {
  if (value === undefined || value === null || value === "") {
    return "auto";
  }

  if (typeof value !== "string" || !allowedValues.includes(value)) {
    const error = new Error(`${fieldName} 不是有效选项。`);
    error.statusCode = 400;
    throw error;
  }

  return value;
}

function mergeClassification(keywordClass, llmResult, overrides) {
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
  handleApi,
};
