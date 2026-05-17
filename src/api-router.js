const fs = require("node:fs");
const path = require("node:path");

const { ENGINE_VERSION } = require("./greenwashing-engine");
const { readJson, readRawBody, sendJson } = require("./http-utils");
const {
  classifyText,
  VALID_CONTEXT_TYPES,
  VALID_SECTORS,
} = require("./text-classifier");
const {
  addFeedback,
  clearHistory,
  deleteHistoryItem,
  exportFeedbackJsonl,
  getStorageInfo,
  readHistory,
} = require("./history-store");
const { analyzeText } = require("./services/analysis-service");
const {
  extractDocumentMetadata,
  getServiceStatus,
  summarizeHistory,
  testLlmConnection,
} = require("./services/llm-service");
const { getNlpServiceStatus } = require("./services/nlp-service-client");
const { createAnalysisJob, getJob } = require("./analysis-jobs");
const { readSettings, writeSettings } = require("./services/settings-service");
const { extractFromBuffer } = require("./pdf-extractor");
const { deepAnalyze } = require("./services/deep-analysis-service");
const { analyze: orchestrateV2, VALID_MODES: V2_MODES } = require("./layers/orchestrator");
const { MAX_TEXT_LENGTH } = require("./pdf-cleaner");

const EVIDENCE_SIDECAR_URL = "http://127.0.0.1:5176";
let _evidenceSidecarAvailable = null;
let _evidenceSidecarCheckedAt = 0;

function getBuildTime() {
  // Check asar mtime first (most reliable for production)
  const asarPath = path.join(__dirname, "..", "..", "app.asar");
  try { return fs.statSync(asarPath).mtime.toISOString(); } catch {}
  // Fallback: check source dir mtime
  try { return fs.statSync(__dirname).mtime.toISOString(); } catch {}
  return new Date().toISOString();
}

async function checkEvidenceSidecar() {
  const now = Date.now();
  // Only cache successes for 10s; always re-check failures
  if (_evidenceSidecarCheckedAt && _evidenceSidecarAvailable && now - _evidenceSidecarCheckedAt < 10000) {
    return true;
  }
  try {
    const resp = await fetch(`${EVIDENCE_SIDECAR_URL}/health`, { signal: AbortSignal.timeout(2000) });
    _evidenceSidecarAvailable = resp.ok;
  } catch {
    _evidenceSidecarAvailable = false;
  }
  _evidenceSidecarCheckedAt = now;
  return _evidenceSidecarAvailable;
}

async function handleApi(request, response, url) {
  const pathname = normalizeApiPath(url.pathname);

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      app: "greenwashing-lens",
      apiVersion: "v1",
      engineVersion: ENGINE_VERSION,
      storage: getStorageInfo(),
      llmService: getServiceStatus(),
      nlpService: await getNlpServiceStatus(),
      evidenceEngine: await checkEvidenceSidecar() ? {
        available: true,
        url: EVIDENCE_SIDECAR_URL,
      } : {
        available: false,
        url: EVIDENCE_SIDECAR_URL,
      },
      buildTime: getBuildTime(),
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

  if (request.method === "GET" && pathname === "/settings") {
    sendJson(response, 200, readSettings());
    return true;
  }

  if (request.method === "PUT" && pathname === "/settings") {
    const body = await readJson(request);
    try {
      const result = writeSettings(body || {});
      sendJson(response, 200, result);
    } catch (err) {
      sendJson(response, 400, { error: err.message || "保存失败" });
    }
    return true;
  }

  if (request.method === "POST" && pathname === "/classify") {
    const body = await readJson(request);
    const normalized = validateAnalysisInput(body);
    sendJson(response, 200, {
      classification: classifyText(normalized.text, {
        contextType: normalized.contextType,
        sector: normalized.sector,
      }),
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

  // Extract company/year/report-type from PDF front matter so the
  // evidence panel form can be pre-filled. Body: { text, filename }.
  // Always returns something (filename heuristic on LLM unavailable).
  if (request.method === "POST" && pathname === "/v2/extract-metadata") {
    const body = await readJson(request);
    const text = typeof body?.text === "string" ? body.text : "";
    const filename = typeof body?.filename === "string" ? body.filename : "";
    if (!text && !filename) {
      sendJson(response, 400, { error: "text 或 filename 至少需要一个。" });
      return true;
    }
    const meta = await extractDocumentMetadata({ text, filename });
    sendJson(response, 200, meta);
    return true;
  }

  // v2 multi-layer pipeline (L0 + L1 + optional L3).
  // Independent of v1 /analyze — kept side-by-side during the Stage 1
  // refactor so existing UI never breaks. See src/layers/orchestrator.js.
  if (request.method === "POST" && pathname === "/v2/analyze") {
    const body = await readJson(request);
    if (typeof body?.text !== "string" || !body.text.trim()) {
      const error = new Error("text 必须是非空字符串。");
      error.statusCode = 400;
      throw error;
    }
    if (body.text.length > MAX_TEXT_LENGTH) {
      const error = new Error(`text 长度不能超过 ${MAX_TEXT_LENGTH} 个字符。`);
      error.statusCode = 400;
      throw error;
    }
    const mode = V2_MODES.includes(body.mode) ? body.mode : "fast";
    const payload = await orchestrateV2(body.text, { mode });
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "POST" && pathname === "/deep-analyze") {
    const body = validateAnalysisInput(await readJson(request));
    const classification = body.classification || classifyText(body.text, {
      contextType: body.contextType,
      sector: body.sector,
    });
    const result = await deepAnalyze(body.text, classification);
    sendJson(response, 200, result);
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

  // Layer 8 feedback: attach user-supplied labels to a history row.
  // Body is open-shape (UI decides what fields to send), persisted as JSON.
  if (request.method === "POST" && pathname.startsWith("/v2/feedback/")) {
    const historyId = decodeURIComponent(pathname.replace("/v2/feedback/", ""));
    if (!historyId) {
      sendJson(response, 400, { error: "缺少 history id。" });
      return true;
    }
    const body = await readJson(request);
    try {
      const result = await addFeedback(historyId, body || {});
      sendJson(response, 200, result);
    } catch (err) {
      const status = err.statusCode || 500;
      sendJson(response, status, { error: err.message });
    }
    return true;
  }

  // Export all labelled rows as JSONL for training pipelines (Stage 4+).
  if (request.method === "GET" && pathname === "/v2/feedback/export") {
    const jsonl = exportFeedbackJsonl({ limit: 100000 });
    response.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": "attachment; filename=greenwashing-feedback.jsonl",
    });
    response.end(jsonl);
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
    sendJson(response, 200, {
      ok: true,
      text,
      document: document || [],
      engine,
      warnings: warnings || [],
      stats: stats || {},
      filename: request.headers["x-filename"] || null,
      size: pdfBuffer.length,
    });
    return true;
  }

  // --- Evidence Engine Proxy ---
  if (pathname.startsWith("/evidence/")) {
    const sidecarPath = pathname.replace("/evidence", "");
    const available = await checkEvidenceSidecar();

    if (!available) {
      sendJson(response, 503, {
        error: "证据核验引擎未启动。请确认 GEMINI_API_KEY 已配置且 Python sidecar 正在运行。",
      });
      return true;
    }

    try {
      const sidecarResp = await fetch(`${EVIDENCE_SIDECAR_URL}${sidecarPath}`, {
        method: request.method,
        headers: { "Content-Type": request.headers["content-type"] || "application/json" },
        body: request.method === "POST" ? await readRawBody(request, 55 * 1024 * 1024) : undefined,
        signal: AbortSignal.timeout(120000),
      });
      const body = await sidecarResp.text();
      response.writeHead(sidecarResp.status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(body);
    } catch {
      sendJson(response, 502, {
        error: "证据核验引擎无响应。请稍后重试。",
      });
    }
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "接口不存在。" });
    return true;
  }

  return false;
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

module.exports = {
  handleApi,
};
