const t = (...args) => window.i18n?.t(...args) ?? args[0];

const form = document.querySelector("#analysisForm");
const textArea = document.querySelector("#claimText");
const contextType = document.querySelector("#contextType");
const sector = document.querySelector("#sector");
const sampleButton = document.querySelector("#sampleButton");
const clearButton = document.querySelector("#clearButton");
const exportButton = document.querySelector("#exportButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const historySummaryButton = document.querySelector("#historySummaryButton");
const historyList = document.querySelector("#historyList");
const historySummary = document.querySelector("#historySummary");
const workspace = document.querySelector(".workspace");
const classificationStatus = document.querySelector("#classificationStatus");

const engineStatus = document.querySelector("#engineStatus");
const riskGauge = document.querySelector("#riskGauge");
const riskScore = document.querySelector("#riskScore");
const riskLevel = document.querySelector("#riskLevel");
const summaryText = document.querySelector("#summaryText");
const classificationStrip = document.querySelector("#classificationStrip");
const claimProbability = document.querySelector("#claimProbability");
const confidenceScore = document.querySelector("#confidenceScore");
const analysisNote = document.querySelector("#analysisNote");
const riskFactors = document.querySelector("#riskFactors");
const matchedSignals = document.querySelector("#matchedSignals");
const llmPanel = document.querySelector("#llmPanel");
const llmSummary = document.querySelector("#llmSummary");
const llmAnnotations = document.querySelector("#llmAnnotations");
const vaguePanel = document.querySelector("#vaguePanel");
const vagueList = document.querySelector("#vagueList");
const contradictionPanel = document.querySelector("#contradictionPanel");
const contradictionList = document.querySelector("#contradictionList");
const credibilityPanel = document.querySelector("#credibilityPanel");
const credibilityList = document.querySelector("#credibilityList");
const rewritePanel = document.querySelector("#rewritePanel");
const rewriteContent = document.querySelector("#rewriteContent");
const copyRewriteButton = document.querySelector("#copyRewriteButton");
const progressPanel = document.querySelector("#progressPanel");
const progressLabel = document.querySelector("#progressLabel");
const progressStageText = document.querySelector("#progressStageText");
const progressMessage = document.querySelector("#progressMessage");
const progressTiming = document.querySelector("#progressTiming");
const progressFill = document.querySelector("#progressFill");
const verificationSummary = document.querySelector("#verificationSummary");
const verificationChecks = document.querySelector("#verificationChecks");
const emotionPanel = document.querySelector("#emotionPanel");
const emotionScore = document.querySelector("#emotionScore");
const emotionLevel = document.querySelector("#emotionLevel");
const emotionWarning = document.querySelector("#emotionWarning");
const emotionRuleBar = document.querySelector("#emotionRuleBar");
const emotionNlpBar = document.querySelector("#emotionNlpBar");
const emotionLlmBar = document.querySelector("#emotionLlmBar");
const emotionRuleValue = document.querySelector("#emotionRuleValue");
const emotionNlpValue = document.querySelector("#emotionNlpValue");
const emotionLlmValue = document.querySelector("#emotionLlmValue");
const emotionConsistency = document.querySelector("#emotionConsistency");
const emotionLayers = document.querySelector("#emotionLayers");
const emotionNlpDetail = document.querySelector("#emotionNlpDetail");

const bars = {
  vagueness: document.querySelector("#vaguenessBar"),
  evidence: document.querySelector("#evidenceBar"),
  overclaim: document.querySelector("#overclaimBar"),
  promise: document.querySelector("#promiseBar"),
};

const pdfUploadZone = document.querySelector("#pdfUploadZone");
const pdfFileInput = document.querySelector("#pdfFileInput");
const pdfUploadStatus = document.querySelector("#pdfUploadStatus");
const docViewer = document.querySelector("#docViewer");
const docViewerBody = document.querySelector("#docViewerBody");
const docViewerClose = document.querySelector("#docViewerClose");
const docViewerOpen = document.querySelector("#docViewerOpen");

const values = {
  vagueness: document.querySelector("#vaguenessValue"),
  evidence: document.querySelector("#evidenceValue"),
  overclaim: document.querySelector("#overclaimValue"),
  promise: document.querySelector("#promiseValue"),
};

const evidenceItems = {
  quantified: document.querySelector("#quantifiedItem"),
  timeline: document.querySelector("#timelineItem"),
  proof: document.querySelector("#proofItem"),
  action: document.querySelector("#actionItem"),
  scope: document.querySelector("#scopeItem"),
};

const sampleText =
  "我们致力于打造更绿色的未来。该系列产品采用环保材料，显著减少对环境的影响，并计划在2030年前实现碳中和。";

const JOB_POLL_INTERVAL_MS = 900;
const JOB_TIMEOUT_MS = 45000;
const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:5173";

let latestAnalysis = null;
let currentJobId = null;
let currentJobStartedAt = 0;
let classifyTimer = null;
let lastClassifiedText = "";
let classificationRequestId = 0;
let classificationSelectionMode = {
  context: contextType?.value === "auto" ? "auto" : "manual",
  sector: sector?.value === "auto" ? "auto" : "manual",
};
let smartClassificationState = null;
let applyingSmartClassification = false;
let preferLegacyAnalyze = false;
let preferV1 = false;
let llmAvailable = false;
let lastV2Payload = null;
let pdfSourceMode = false;
let nlpServiceAvailable = false;
const apiBase = resolveApiBase();
const localEngine = window.GreenwashLocal || null;
const isDesktopMode = new URLSearchParams(window.location.search).get("desktop") === "1";
const isLocalAppHost = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);

const CSRF_META = document.querySelector('meta[name="csrf-token"]');
const CSRF_TOKEN = CSRF_META ? CSRF_META.content : "";

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (CSRF_TOKEN) headers.set("X-CSRF-Token", CSRF_TOKEN);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  return fetch(url, { ...options, headers });
}

function resolveAnalysisMode() {
  const modeSelect = document.getElementById("analysisMode");
  const explicit = modeSelect?.value || "auto";
  if (explicit !== "auto") return explicit;
  if (pdfSourceMode && llmAvailable) return "comprehensive";
  if (pdfSourceMode) return "standard";
  return "fast";
}

async function analyzeText() {
  const text = textArea.value.trim();

  if (!text) {
    latestAnalysis = null;
    lastV2Payload = null;
    exportButton.disabled = true;
    clearTimeout(classifyTimer);
    lastClassifiedText = "";
    setClassificationStatus(t('classification.autoHint'));
    renderResult(createEmptyResult());
    hideV2Sections();
    renderLlm(null, null);
    renderLlmDetails(null);
    renderVerification(null);
    renderProgress({
      status: "idle",
      stage: "idle",
      progress: 0,
      message: t('progress.idle'),
    });
    textArea.focus();
    return;
  }

  currentJobId = null;
  currentJobStartedAt = Date.now();
  latestAnalysis = null;
  lastV2Payload = null;
  exportButton.disabled = true;
  setBusy(true);
  hideV2Sections();
  renderProgress({
    status: "creating",
    stage: "creating",
    progress: 4,
    message: t('msg.creating'),
  });
  renderVerification(null);

  try {
    const requestPayload = buildAnalysisRequestPayload(text);

    if (preferV1) {
      await runV1Analysis(requestPayload);
      return;
    }

    const mode = resolveAnalysisMode();
    const stopTicker = startV2ProgressTicker(mode);

    try {
      const response = await apiFetch(apiUrl("/api/v2/analyze"), {
        method: "POST",
        body: JSON.stringify({ text, mode }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 404) {
          preferV1 = true;
          stopTicker();
          await runV1Analysis(requestPayload);
          return;
        }
        throw new Error(payload?.error || t('msg.v2Failed'));
      }

      stopTicker();
      lastV2Payload = payload;
      latestAnalysis = payload;
      exportButton.disabled = false;
      renderV2Result(payload);
      renderProgress({
        status: "completed",
        stage: "completed",
        progress: 100,
        elapsedMs: Date.now() - currentJobStartedAt,
        message: t('msg.v2Done', { mode: payload.mode, stages: payload.meta?.stages_run?.join("→") || "" }),
      });
      engineStatus.textContent = t('status.connected', { version: payload.meta?.engineVersion || "v2" });
      loadHistory();
    } catch (err) {
      stopTicker();
      throw err;
    }
  } catch (error) {
    if (!preferV1) {
      try {
        await runV1Analysis(buildAnalysisRequestPayload(text));
        return;
      } catch {}
    }
    if (localEngine) {
      await runLocalAnalysis(buildAnalysisRequestPayload(text), error.message || t('msg.analysisFailed'));
    } else {
      failAnalysis(error.message || t('msg.analysisFailed'));
    }
  } finally {
    setBusy(false);
  }
}

async function runV1Analysis(requestPayload) {
  if (preferLegacyAnalyze) {
    await runLegacyAnalysis(requestPayload);
    return;
  }
  try {
    const response = await apiFetch(apiUrl("/api/v1/analyze-jobs"), {
      method: "POST",
      body: JSON.stringify(requestPayload),
    });
    const job = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404 || /接口不存在|not found/i.test(job?.error || "")) {
        preferLegacyAnalyze = true;
        await runLegacyAnalysis(requestPayload);
        return;
      }
      throw new Error(job?.error || t('msg.jobCreateFailed'));
    }
    currentJobId = job.id;
    renderProgress(job);
    await pollJob(job.id, requestPayload);
  } catch (err) {
    await runLegacyAnalysis(requestPayload);
  }
}

function startV2ProgressTicker(mode) {
  const modeStages = {
    fast: [
      { after: 0, stage: "L0", progress: 20, message: "L0 Atomic claim splitting" },
      { after: 400, stage: "L1", progress: 60, message: "L1 Feature extraction" },
    ],
    standard: [
      { after: 0, stage: "L0", progress: 10, message: "L0 Atomic claim splitting" },
      { after: 500, stage: "L1", progress: 25, message: "L1 Feature extraction" },
      { after: 1000, stage: "L3", progress: 50, message: "L3 LLM claim structuring" },
    ],
    comprehensive: [
      { after: 0, stage: "L0", progress: 5, message: "L0 Atomic claim splitting" },
      { after: 500, stage: "L1", progress: 12, message: "L1 Feature extraction" },
      { after: 1000, stage: "L3", progress: 30, message: "L3 LLM claim structuring" },
      { after: 5000, stage: "L5a", progress: 55, message: "L5a Certification detection" },
      { after: 6000, stage: "L6", progress: 70, message: "L6 Consistency & seven sins" },
      { after: 7000, stage: "L7", progress: 85, message: "L7 GRI aggregation" },
    ],
  };
  const stages = modeStages[mode] || modeStages.fast;
  const interval = setInterval(() => {
    const elapsed = Date.now() - currentJobStartedAt;
    const stage = stages.reduce(
      (sel, c) => (elapsed >= c.after ? c : sel),
      stages[0],
    );
    renderProgress({
      status: "running",
      stage: stage.stage,
      progress: stage.progress,
      message: stage.message,
      elapsedMs: elapsed,
      stalled: elapsed > 30000,
    });
  }, 400);
  return () => clearInterval(interval);
}

async function pollJob(jobId, requestPayload) {
  let notFoundCount = 0;

  while (true) {
    if (Date.now() - currentJobStartedAt > JOB_TIMEOUT_MS) {
      throw new Error(t('msg.timeout'));
    }

    const response = await apiFetch(apiUrl(`/api/v1/analyze-jobs/${encodeURIComponent(jobId)}`));
    const job = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 404) {
        notFoundCount += 1;

        if (notFoundCount >= 2) {
          currentJobId = null;
          preferLegacyAnalyze = true;
          renderProgress({
            status: "running",
            stage: "fallback",
            progress: 100,
            elapsedMs: Date.now() - currentJobStartedAt,
            message: t('msg.switchedFallback'),
          });
          await runLegacyAnalysis(requestPayload);
          return;
        }

        await sleep(JOB_POLL_INTERVAL_MS);
        continue;
      }

      throw new Error(job.error || t('msg.jobReadFailed'));
    }

    notFoundCount = 0;

    renderProgress(job);
    renderJobSnapshot(job);

    if (job.status === "completed") {
      latestAnalysis = job.result;
      exportButton.disabled = false;
      engineStatus.textContent = t('status.connected', { version: job.result.meta.engineVersion });
      applyHighlights(job.result?.result?.signals || []);
      loadHistory();
      return;
    }

    if (job.status === "failed") {
      throw new Error(job.error || t('msg.jobFailed'));
    }

    await sleep(JOB_POLL_INTERVAL_MS);
  }
}

function renderJobSnapshot(job) {
  const payload = normalizePayload(job.result || job.partial, {
    allowClientVerification: job.status === "completed",
  });
  if (!payload) return;

  document.querySelector(".result-panel").classList.remove("analyzing");

  if (payload.result) {
    renderResult(payload.result);
  }

  renderLlm(payload.llm || null, payload.meta?.llmService || null);
  renderLlmDetails(payload.llm || null);
  renderVerification(payload.verification || null);
}

function failAnalysis(message) {
  const detail =
    message || buildUnavailableMessage();
  latestAnalysis = null;
  exportButton.disabled = true;
  engineStatus.textContent = t('status.disconnected');
  renderResult({
    ...createEmptyResult(),
    level: t('msg.connectionAbnormal'),
    summary: detail,
    factors: [t('msg.connectionFailed')],
    signals: [fileModeHint()],
  });
  renderLlm(
    {
      enabled: false,
      provider: "none",
      model: null,
      summary: t('msg.noLlmResult'),
      annotations: [],
      error: detail,
    },
    null,
  );
  renderLlmDetails(null);
  renderVerification({
    overall: "fail",
    checks: [
      {
        id: "analysis_failed",
        status: "fail",
        title: t('clientVerif.analysisFailedTitle'),
        message: detail,
      },
    ],
  });
  renderProgress({
    status: "failed",
    stage: "failed",
    progress: 100,
    message: detail,
  });
}

async function loadHistory() {
  try {
    const response = await apiFetch(apiUrl("/api/history?limit=12"));
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || t('msg.historyReadFailed'));
    }

    renderHistory(payload.items || []);
  } catch {
    if (localEngine) {
      renderHistory(localEngine.loadHistory());
      return;
    }
    renderHistory([]);
  }
}

function renderTrendChart(items) {
  const chart = document.getElementById("historyChart");
  const svg = document.getElementById("historyChartSvg");
  const subtitle = document.getElementById("historyChartSubtitle");
  if (!chart || !svg) return;

  const sorted = [...items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const scores = sorted.map((item) => item.result.risk);
  const dates = sorted.map((item) => {
    const d = new Date(item.createdAt);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  if (scores.length < 2) {
    chart.hidden = true;
    return;
  }

  chart.hidden = false;
  if (subtitle) subtitle.textContent = t('history.recentCount', { n: scores.length });

  const W = 720, H = 200;
  const padLeft = 42, padRight = 16, padTop = 16, padBottom = 22;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const xScale = (i) => padLeft + (i / Math.max(scores.length - 1, 1)) * plotW;
  const yScale = (v) => padTop + plotH - (v / 100) * plotH;

  let svgContent = "";

  // Grid lines and Y labels
  [0, 25, 50, 75, 100].forEach((val) => {
    const y = yScale(val);
    svgContent += `<line class="chart-grid-line" x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}"/>`;
    svgContent += `<text class="chart-axis-label chart-axis-label-right" x="${padLeft - 6}" y="${y + 4}">${val}</text>`;
  });

  // X labels
  scores.forEach((_, i) => {
    if (scores.length <= 6 || i % Math.ceil(scores.length / 6) === 0 || i === scores.length - 1) {
      const x = xScale(i);
      svgContent += `<text class="chart-axis-label chart-axis-label-center" x="${x}" y="${H - 4}">${dates[i]}</text>`;
    }
  });

  // Moving average (3-period SMA)
  const sma = [];
  for (let i = 0; i < scores.length; i++) {
    const window = scores.slice(Math.max(0, i - 1), Math.min(scores.length, i + 2));
    sma.push(Math.round(window.reduce((a, b) => a + b, 0) / window.length));
  }

  // SMA line
  let smaPath = "";
  sma.forEach((val, i) => {
    smaPath += `${i === 0 ? "M" : "L"}${xScale(i)} ${yScale(val)} `;
  });
  svgContent += `<path class="chart-avg-line" d="${smaPath.trim()}"/>`;

  // Risk score line
  let scorePath = "";
  scores.forEach((val, i) => {
    scorePath += `${i === 0 ? "M" : "L"}${xScale(i)} ${yScale(val)} `;
  });
  svgContent += `<path class="chart-score-line" d="${scorePath.trim()}"/>`;

  // Data points
  scores.forEach((val, i) => {
    const x = xScale(i), y = yScale(val);
    svgContent += `<circle class="chart-dot chart-dot-circle" cx="${x}" cy="${y}" r="3.5" data-score="${val}" data-date="${dates[i]}"/>`;
  });

  svg.innerHTML = svgContent;

  // Tooltip
  setupChartTooltip(svg, chart);
}

function setupChartTooltip(svg, container) {
  let tooltip = document.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.hidden = true;
    container.style.position = "relative";
    container.append(tooltip);
  }

  svg.querySelectorAll(".chart-dot").forEach((dot) => {
    dot.addEventListener("mouseenter", (e) => {
      const score = dot.getAttribute("data-score");
      const date = dot.getAttribute("data-date");
      tooltip.textContent = `${date} · ${score}%`;
      tooltip.hidden = false;
    });
    dot.addEventListener("mousemove", (e) => {
      const rect = svg.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const percentX = svgX / rect.width;
      tooltip.style.left = (percentX * 100) + "%";
      tooltip.style.top = (e.clientY - rect.top - 12) + "px";
    });
    dot.addEventListener("mouseleave", () => {
      tooltip.hidden = true;
    });
  });
}

function renderHistory(items) {
  historyList.innerHTML = "";

  if (!items.length) {
    historySummary.hidden = true;
    const chart = document.getElementById("historyChart");
    if (chart) chart.hidden = true;
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = t('history.noRecords');
    historyList.append(empty);
    return;
  }

  renderTrendChart(items);

  items.forEach((item) => {
    const wrapper = document.createElement("div");
    const openButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const preview =
      item.request.text.length > 140 ? `${item.request.text.slice(0, 140)}...` : item.request.text;

    wrapper.className = "history-item";
    wrapper.dataset.id = item.id;

    openButton.className = "history-open";
    openButton.type = "button";
    openButton.innerHTML = `
      <span class="history-score">${Math.round(item.result.risk)}%</span>
      <span class="history-main">
        <strong>${item.result.level}</strong>
        <small>${formatDate(item.createdAt)} · ${labelForContext(item.classification?.context?.selected || item.request.contextType)} · ${labelForSector(item.classification?.sector?.selected || item.request.sector)}</small>
        <span>${escapeHtml(preview)}</span>
      </span>
    `;
    openButton.addEventListener("click", () => restoreHistoryItem(item));

    deleteButton.className = "history-delete";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", t('history.deleteAriaLabel'));
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeHistoryItem(item.id, wrapper);
    });

    wrapper.append(openButton, deleteButton);
    historyList.append(wrapper);
  });
}

function setClassificationStatus(message, state = "idle") {
  if (!classificationStatus) return;
  classificationStatus.textContent = message;
  classificationStatus.dataset.state = state;
}

function isManualClassificationField(field) {
  const select = field === "context" ? contextType : sector;
  return classificationSelectionMode[field] === "manual" && select.value !== "auto";
}

function hasSmartClassificationForField(field) {
  if (!smartClassificationState) return false;
  const text = textArea.value.trim();
  const key = field === "context" ? "contextType" : "sector";
  const autoKey = field === "context" ? "contextAuto" : "sectorAuto";
  const select = field === "context" ? contextType : sector;
  return smartClassificationState[autoKey] !== false &&
    smartClassificationState.text === text &&
    smartClassificationState[key] === select.value;
}

function getClassificationRequestValue(field) {
  if (hasSmartClassificationForField(field)) {
    return "auto";
  }

  const select = field === "context" ? contextType : sector;
  return isManualClassificationField(field) ? select.value : "auto";
}

function buildAnalysisRequestPayload(text) {
  return {
    text,
    contextType: getClassificationRequestValue("context"),
    sector: getClassificationRequestValue("sector"),
  };
}

function resetClassificationControls({ resetSelects = false } = {}) {
  clearTimeout(classifyTimer);
  lastClassifiedText = "";
  classificationSelectionMode = {
    context: "auto",
    sector: "auto",
  };
  smartClassificationState = null;
  if (resetSelects) {
    contextType.value = "auto";
    sector.value = "auto";
  }
}

function scheduleSmartClassification() {
  clearTimeout(classifyTimer);
  const text = textArea.value.trim();

  if (text.length < 80) {
    setClassificationStatus(t('classification.autoHint'));
    return;
  }

  if (isManualClassificationField("context") && isManualClassificationField("sector")) {
    setClassificationStatus(t('classification.manualHint'));
    return;
  }

  setClassificationStatus(t('classification.loadingHint'), "loading");
  classifyTimer = setTimeout(() => {
    classifyCurrentText({ reason: "typing" });
  }, 1200);
}

async function classifyCurrentText({ force = false, reason = "text" } = {}) {
  const text = textArea.value.trim();

  if (!text || text.length < 20) {
    setClassificationStatus(t('classification.autoHint'));
    return null;
  }

  if (!force && text === lastClassifiedText) {
    return null;
  }

  const requestPayload = buildAnalysisRequestPayload(text);

  if (!force && requestPayload.contextType !== "auto" && requestPayload.sector !== "auto") {
    setClassificationStatus(t('classification.manualHint'));
    return null;
  }

  const requestId = ++classificationRequestId;
  lastClassifiedText = text;
  setClassificationStatus(
    reason === "pdf" ? t('classification.pdfLoading') : t('classification.aiLoading'),
    "loading",
  );

  try {
    const response = await apiFetch(apiUrl("/api/v1/classify"), {
      method: "POST",
      body: JSON.stringify({
        text,
        contextType: requestPayload.contextType,
        sector: requestPayload.sector,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || t('msg.autoClassifyFailed'));
    }

    if (requestId !== classificationRequestId || !payload?.classification) {
      return null;
    }

    const classification = payload.classification;
    applyingSmartClassification = true;
    try {
      if (classification.context?.selected) {
        contextType.value = classification.context.selected;
        classificationSelectionMode.context = requestPayload.contextType === "auto" ? "auto" : "manual";
      }
      if (classification.sector?.selected) {
        sector.value = classification.sector.selected;
        classificationSelectionMode.sector = requestPayload.sector === "auto" ? "auto" : "manual";
      }
    } finally {
      applyingSmartClassification = false;
    }
    smartClassificationState = {
      text,
      contextType: classification.context?.selected || contextType.value,
      sector: classification.sector?.selected || sector.value,
      contextAuto: requestPayload.contextType === "auto",
      sectorAuto: requestPayload.sector === "auto",
    };

    const contextLabel = classification.context?.label || labelForContext(contextType.value);
    const sectorLabel = classification.sector?.label || labelForSector(sector.value);
    const methodLabel = payload.method === "llm" ? t('classification.sourceAI') : t('classification.sourceKeyword');
    setClassificationStatus(t('classification.aiIdentified', { method: methodLabel, context: contextLabel, sector: sectorLabel }), "success");
    renderClassification(classification);
    return classification;
  } catch (error) {
    if (requestId === classificationRequestId) {
      setClassificationStatus(error.message || t('classification.errorFallback'), "error");
    }
    return null;
  }
}

function restoreHistoryItem(item) {
  const payload = normalizePayload(item, { allowClientVerification: true });

  textArea.value = item.request.text;
  updatePdfUploadVisibility();
  contextType.value = item.request.contextType || "auto";
  sector.value = item.request.sector || "auto";
  classificationSelectionMode = {
    context: item.classification?.context?.source === "manual" ? "manual" : "auto",
    sector: item.classification?.sector?.source === "manual" ? "manual" : "auto",
  };
  smartClassificationState =
    item.classification?.context?.source === "manual" && item.classification?.sector?.source === "manual"
      ? null
      : {
          text: item.request.text,
          contextType: item.classification?.context?.selected || contextType.value,
          sector: item.classification?.sector?.selected || sector.value,
          contextAuto: item.classification?.context?.source !== "manual",
          sectorAuto: item.classification?.sector?.source !== "manual",
        };
  latestAnalysis = payload;
  exportButton.disabled = false;
  renderResult(payload.result);
  renderLlm(payload.llm, payload.meta?.llmService);
  renderLlmDetails(payload.llm || null);
  renderVerification(payload.verification || null);
  renderProgress({
    status: "completed",
    stage: "completed",
    progress: 100,
    message: t('msg.historyRestored'),
  });
}

async function clearHistory() {
  try {
    const response = await apiFetch(apiUrl("/api/history"), { method: "DELETE" });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || t('msg.clearFailed'));
    }

    renderHistory([]);
    historySummary.hidden = true;
  } catch {
    if (localEngine) {
      localEngine.clearHistory();
      renderHistory([]);
      historySummary.hidden = true;
      return;
    }
    renderHistory([]);
    historySummary.hidden = true;
  }
}

async function removeHistoryItem(id, element) {
  try {
    const response = await apiFetch(apiUrl(`/api/v1/history/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || t('msg.deleteFailed'));
    }

    element.remove();
    if (!historyList.children.length) {
      renderHistory([]);
      historySummary.hidden = true;
    }
  } catch {
    if (localEngine) {
      localEngine.deleteHistoryItem?.(id);
      element.remove();
      if (!historyList.children.length) {
        renderHistory([]);
        historySummary.hidden = true;
      }
    }
  }
}

function animateValue(element, start, end, duration, formatFn) {
  if (start === end) {
    element.textContent = formatFn ? formatFn(end) : end;
    return;
  }
  const range = end - start;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + range * eased);
    element.textContent = formatFn ? formatFn(current) : current;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderResult(result) {
  // After every render, refresh the deep-analyze button availability
  setTimeout(updateDeepAnalyzeButton, 0);
  const colorMap = {
    green: "var(--green)",
    teal: "var(--teal)",
    amber: "var(--amber)",
    red: "var(--red)",
  };

  const currentScore = parseInt(riskScore.textContent) || 0;
  const targetScore = Math.round(result.risk);

  riskGauge.style.setProperty("--score", targetScore);
  riskGauge.style.setProperty("--gauge-color", colorMap[result.tone] || "var(--muted)");
  animateValue(riskScore, currentScore, targetScore, 500, (v) => `${v}%`);
  riskLevel.textContent = result.level;
  summaryText.textContent = result.summary;
  renderClassification(result.classification);
  claimProbability.textContent = percent(result.claimProb);
  confidenceScore.textContent = percent(result.confidence);
  if (analysisNote) {
    analysisNote.textContent = buildAnalysisNote(result);
  }

  updateBreakdown("vagueness", result.components.vagueness);
  updateBreakdown("evidence", result.components.evidence);
  updateBreakdown("overclaim", result.components.overclaim);
  updateBreakdown("promise", result.components.promise);

  updateEvidence(result.evidence);
  renderList(riskFactors, result.factors);
  renderList(matchedSignals, result.signals);
  renderEmotionAnalysis(result.emotionAnalysis || createEmptyEmotionAnalysis());
}

function hideV2Sections() {
  const ids = ["v2Overview", "v2ClaimsSection", "v2ConsistencySection"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

function renderV2Result(payload) {
  hideWelcome();
  const scoring = payload.scoring;
  const perClaim = payload.perClaim || [];
  const consistency = payload.consistency;
  const doc = payload.document || {};

  if (scoring) {
    const gri = Math.round(scoring.document?.gri || 0);
    const riskLevel2 = scoring.document?.risk_level || "待分析";
    const colorMap = { "低风险": "var(--green)", "中低风险": "var(--teal)", "中高风险": "var(--amber)", "高风险": "var(--red)", "low-risk": "var(--green)", "medium-low-risk": "var(--teal)", "medium-high-risk": "var(--amber)", "high-risk": "var(--red)" };
    const toneMap = { "低风险": "green", "中低风险": "teal", "中高风险": "amber", "高风险": "red" };

    riskGauge.style.setProperty("--score", gri);
    riskGauge.style.setProperty("--gauge-color", colorMap[riskLevel2] || "var(--muted)");
    animateValue(riskScore, parseInt(riskScore.textContent) || 0, gri, 500, (v) => `${v}`);
    riskLevel.textContent = riskLevel2;
    summaryText.textContent = t('v2.summary', { gri, count: perClaim.length, mode: payload.mode });

    const strip = document.getElementById("classificationStrip");
    if (strip) {
      strip.innerHTML = `
        <span>${t('v2.langLine', { lang: doc.language || "?" })}</span>
        <span>${t('v2.claimCountLine', { count: doc.claim_count || 0 })}</span>
        <span>${t('v2.layerLine', { stages: (payload.meta?.stages_run || []).join("→") })}</span>
      `;
    }
    if (claimProbability) claimProbability.textContent = `${gri}`;
    if (confidenceScore) confidenceScore.textContent = t('v2.claimCountLine', { count: perClaim.length });
    if (analysisNote) {
      analysisNote.textContent = scoring.document?.risk_level
        ? t('v2.analysisNote', { gri, level: riskLevel2 })
        : "";
    }

    renderV2Breakdown(perClaim);
    renderV2Sins(consistency);
    renderV2TopConcerns(scoring.top_concerns || []);
  } else {
    riskGauge.style.setProperty("--score", 0);
    riskLevel.textContent = `${payload.mode} mode`;
    summaryText.textContent = t('v2.fastSummary', { stages: (payload.meta?.stages_run || []).join("→"), count: perClaim.length });
    renderV2Breakdown(perClaim);
  }

  renderV2Claims(perClaim);
  renderV2Consistency(consistency);

  renderLlm(null, null);
  renderLlmDetails(null);
  renderVerification(null);
}

function renderV2Breakdown(perClaim) {
  if (!perClaim.length) return;
  let vague = 0, evidence = 0, overclaim = 0, promise = 0;
  perClaim.forEach((c) => {
    const f = c.features?.categories || {};
    vague += (f.vague?.count || 0);
    evidence += (f.proof?.count || 0) > 0 ? 0 : 1;
    overclaim += (f.absolute?.count || 0);
    promise += (f.future?.count || 0);
  });
  const scale = Math.max(1, perClaim.length);
  updateBreakdown("vagueness", (vague / scale) * 25);
  updateBreakdown("evidence", (evidence / scale) * 25);
  updateBreakdown("overclaim", (overclaim / scale) * 25);
  updateBreakdown("promise", (promise / scale) * 25);
}

function renderV2Sins(consistency) {
  const row = document.getElementById("v2SinsRow");
  const section = document.getElementById("v2Overview");
  if (!row || !section) return;
  row.innerHTML = "";

  if (!consistency?.sins?.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const sinLabels = {
    hidden_tradeoff: t('v2.sin.hiddenTradeoff'),
    no_proof: t('v2.sin.noProof'),
    vagueness: t('v2.sin.vagueness'),
    false_labels: t('v2.sin.falseLabels'),
    irrelevance: t('v2.sin.irrelevance'),
    lesser_of_evils: t('v2.sin.lesserOfEvils'),
    fibbing: t('v2.sin.fibbing'),
  };
  const sinColors = {
    high: "var(--red)",
    medium: "var(--amber)",
    low: "var(--teal)",
  };
  consistency.sins.forEach((sin) => {
    const chip = document.createElement("span");
    chip.className = "v2-sin-chip";
    chip.style.borderColor = sinColors[sin.severity] || "var(--muted)";
    chip.textContent = `${sinLabels[sin.sin] || sin.sin} (${sin.severity})`;
    chip.title = t('v2.sinEvidence', { count: sin.evidence_count || 0 });
    row.appendChild(chip);
  });
}

function renderV2TopConcerns(concerns) {
  const list = document.getElementById("v2ConcernsList");
  const section = document.getElementById("v2Overview");
  if (!list) return;
  list.innerHTML = "";
  if (!concerns.length) return;
  if (section) section.hidden = false;
  concerns.slice(0, 5).forEach((c) => {
    const li = document.createElement("li");
    li.textContent = `${c.label || c.sin || ""}: ${c.description || ""} (${c.severity || ""})`;
    list.appendChild(li);
  });
}

function renderV2Claims(perClaim) {
  const section = document.getElementById("v2ClaimsSection");
  const list = document.getElementById("v2ClaimsList");
  const count = document.getElementById("v2ClaimsCount");
  if (!section || !list) return;
  if (!perClaim.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  if (count) count.textContent = perClaim.length;
  list.innerHTML = "";

  perClaim.forEach((claim) => {
    const card = document.createElement("div");
    card.className = "v2-claim-card";

    const header = document.createElement("div");
    header.className = "v2-claim-header";

    const typeTag = document.createElement("span");
    typeTag.className = "v2-claim-type";
    typeTag.textContent = claim.claim_type || "claim";
    header.appendChild(typeTag);

    if (claim.risk) {
      const riskTag = document.createElement("span");
      riskTag.className = "v2-claim-risk";
      const riskVal = Math.round(claim.risk.combined || 0);
      riskTag.textContent = `GRI ${riskVal}`;
      riskTag.dataset.level = riskVal > 75 ? "high" : riskVal > 50 ? "medium" : "low";
      header.appendChild(riskTag);
    }

    if (claim.certifications?.false_labels?.length) {
      claim.certifications.false_labels.forEach((fl) => {
        const flTag = document.createElement("span");
        flTag.className = "v2-false-label";
        flTag.textContent = fl.pattern || fl.type;
        header.appendChild(flTag);
      });
    }

    card.appendChild(header);

    const textP = document.createElement("p");
    textP.className = "v2-claim-text";
    textP.textContent = claim.text;
    card.appendChild(textP);

    if (claim.structure) {
      const details = document.createElement("details");
      details.className = "v2-claim-details";
      const summary = document.createElement("summary");
      summary.textContent = t('v2.structuredDetails');
      details.appendChild(summary);
      const pre = document.createElement("div");
      pre.className = "v2-claim-structure";
      const s = claim.structure;
      const lines = [];
      if (s.metric?.name) lines.push(`Metric: ${s.metric.name} ${s.metric.value || ""} ${s.metric.unit || ""}`);
      if (s.time_horizon?.target_year) lines.push(`Target year: ${s.time_horizon.target_year}`);
      if (s.scope?.boundary) lines.push(`Scope: ${s.scope.boundary}`);
      if (s.baseline?.reference_year) lines.push(`Baseline: ${s.baseline.reference_year}`);
      if (s.evidence_cited) lines.push(`Evidence cited: ${s.evidence_cited}`);
      if (s.confidence) lines.push(`Confidence: ${s.confidence}`);
      pre.textContent = lines.join("\n") || t('v2.noStructuredData');
      details.appendChild(pre);
      card.appendChild(details);
    }

    list.appendChild(card);
  });
}

function renderV2Consistency(consistency) {
  const section = document.getElementById("v2ConsistencySection");
  const list = document.getElementById("v2ContradictionsList");
  if (!section || !list) return;
  if (!consistency?.contradictions?.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  list.innerHTML = "";
  consistency.contradictions.forEach((c) => {
    const card = document.createElement("div");
    card.className = "v2-contradiction-card";
    card.innerHTML = `
      <strong>${escapeHtml(c.type || t('v2.contradiction'))}</strong>
      <span class="v2-severity" data-level="${escapeHtml(c.severity || "medium")}">${escapeHtml(c.severity || "")}</span>
      <p>${escapeHtml(c.description || "")}</p>
    `;
    list.appendChild(card);
  });
}

function renderEmotionAnalysis(emotion) {
  if (!emotionPanel || !emotionScore || !emotionLevel) return;

  const breakdown = emotion?.breakdown || {};
  const finalScore = Math.round(Number(emotion?.finalScore || 0));
  const level = emotion?.level || "none";
  const consistency = Math.round(Number(emotion?.consistency || 0));
  const layersUsed = Number(emotion?.layersUsed || 0);
  const levelLabelMap = {
    none: t('emotion.level.none'),
    low: t('emotion.level.low'),
    medium: t('emotion.level.medium'),
    high: t('emotion.level.high'),
  };
  const plainExplainMap = {
    none: t('emotion.explain.none'),
    low: t('emotion.explain.low'),
    medium: t('emotion.explain.medium'),
    high: t('emotion.explain.high'),
  };

  emotionPanel.dataset.level = level;
  emotionScore.textContent = layersUsed ? String(finalScore) : "--";
  emotionLevel.textContent = layersUsed ? levelLabelMap[level] || t('progress.labelIdle') : t('progress.labelIdle');
  emotionWarning.hidden = consistency >= 60 || layersUsed < 2;

  const plainExplain = document.getElementById("emotionPlainExplain");
  if (plainExplain) {
    plainExplain.textContent = layersUsed
      ? (plainExplainMap[level] || plainExplainMap.none)
      : t('emotion.explainPending');
  }

  updateEmotionBar(emotionRuleBar, emotionRuleValue, breakdown.rule, "0");
  updateEmotionBar(emotionNlpBar, emotionNlpValue, breakdown.nlp, "--");
  updateEmotionBar(emotionLlmBar, emotionLlmValue, breakdown.llm, "0");

  emotionConsistency.textContent =
    layersUsed >= 2 ? t('emotion.consistencyLabel', { pct: consistency }) : layersUsed === 1 ? t('emotion.consistencyPending') : t('emotion.consistencyAnalyzing');
  emotionLayers.textContent = layersUsed ? t('emotion.layersLabel', { n: layersUsed }) : t('emotion.layersAnalyzing');
  renderEmotionNlpDetail(emotion?.nlpDetail || null, {
    nlpAvailable: breakdown.nlp !== null,
    layersUsed,
  });

  const summary = document.getElementById("emotionCollapsibleSummary");
  if (summary) {
    if (!layersUsed) {
      summary.textContent = t('emotion.summaryPending');
    } else if (level === "high") {
      summary.textContent = t('emotion.summaryHigh', { score: finalScore });
    } else if (level === "medium") {
      summary.textContent = t('emotion.summaryMedium', { score: finalScore });
    } else {
      summary.textContent = t('emotion.summaryLow', { score: finalScore });
    }
  }
  if (layersUsed > 0) autoExpandCard("emotion");
}

function updateEmotionBar(bar, valueElement, value, fallbackText) {
  if (!bar || !valueElement) return;
  if (value === null || value === undefined) {
    bar.style.width = "0%";
    valueElement.textContent = fallbackText;
    return;
  }

  const score = Math.round(Number(value || 0));
  bar.style.width = `${clamp(score)}%`;
  valueElement.textContent = String(score);
}

function renderEmotionNlpDetail(detail, options = {}) {
  if (!emotionNlpDetail) return;
  emotionNlpDetail.innerHTML = "";
  const { nlpAvailable, layersUsed = 0 } = options;

  if (!layersUsed) {
    emotionNlpDetail.hidden = true;
    return;
  }

  if (!detail && !nlpAvailable) {
    emotionNlpDetail.hidden = false;
    const tag = document.createElement("span");
    tag.textContent = nlpServiceAvailable ? t('emotion.nlpNotParticipated') : t('emotion.nlpOffline');
    emotionNlpDetail.append(tag);
    return;
  }

  emotionNlpDetail.hidden = !detail;
  if (!detail) return;

  const items = [
    `ClimateBERT: ${detail.climateSentiment || "unknown"}`,
    `Confidence: ${percent((detail.sentimentConfidence || 0) * 100)}`,
    `Commitment type: ${detail.commitmentType || "unknown"}`,
    `Specificity: ${percent((detail.specificityScore ?? 0) * 100)}`,
  ];

  items.forEach((item) => {
    const tag = document.createElement("span");
    tag.textContent = item;
    emotionNlpDetail.append(tag);
  });
}

function renderLlm(llm, serviceStatus) {
  const provider = serviceStatus?.provider || llm?.provider || "none";

  llmPanel.dataset.enabled = llm?.enabled ? "true" : "false";

  const summary = document.getElementById("llmCollapsibleSummary");

  if (!llm) {
    llmSummary.textContent = t('llm.noApiConfig');
    renderList(llmAnnotations, [t('llm.noResults')]);
    if (summary) summary.textContent = t('llm.noConfig');
    return;
  }

  if (llm.error) {
    llmSummary.textContent = t('llm.callFailed', { provider, error: llm.error });
    renderList(llmAnnotations, [t('llm.noResults')]);
    if (summary) summary.textContent = t('llm.callFailedSummary', { provider });
    return;
  }

  llmSummary.textContent = llm.enabled
    ? `${provider} · ${llm.model}：${llm.summary}`
    : t('llm.notEnabledMsg', { summary: llm.summary });
  renderList(
    llmAnnotations,
    llm.annotations && llm.annotations.length ? llm.annotations : [t('llm.noResults')],
  );

  if (summary) {
    summary.textContent = llm.enabled
      ? `${provider} · ${llm.model}`
      : t('llm.notEnabled');
  }
  if (llm.enabled) autoExpandCard("llm");
}

function renderLlmDetails(llm) {
  const hasLlmDetails = Boolean(
    llm?.enabled && (
      (llm.vagueExplanations && llm.vagueExplanations.length) ||
      (llm.contradictions && llm.contradictions.length) ||
      (llm.credibilityNotes && llm.credibilityNotes.length) ||
      llm.rewriteSuggestion
    ),
  );

  if (!hasLlmDetails) {
    vaguePanel.hidden = true;
    contradictionPanel.hidden = true;
    credibilityPanel.hidden = true;
    rewritePanel.hidden = true;
    vagueList.innerHTML = "";
    contradictionList.innerHTML = "";
    credibilityList.innerHTML = "";
    rewriteContent.textContent = "";
    return;
  }

  renderVagueExplanations(llm.vagueExplanations || []);
  renderContradictions(llm.contradictions || []);
  renderCredibilityNotes(llm.credibilityNotes || []);
  renderRewriteSuggestion(llm.rewriteSuggestion || null);
}

function renderVagueExplanations(items) {
  vagueList.innerHTML = "";
  vaguePanel.hidden = !items.length;
  if (!items.length) return;

  const list = document.createElement("div");
  list.className = "llm-detail-list";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "llm-detail-item";
    card.innerHTML = `
      <div class="llm-quote">“${escapeHtml(item.original || "")}”</div>
      <div>${escapeHtml(item.issue || "")}</div>
      <div class="llm-suggestion">${escapeHtml(item.suggestion || "")}</div>
    `;
    list.append(card);
  });

  vagueList.append(list);
}

function renderContradictions(items) {
  contradictionList.innerHTML = "";
  contradictionPanel.hidden = !items.length;
  if (!items.length) return;

  const list = document.createElement("div");
  list.className = "llm-detail-list";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "llm-detail-item";
    card.innerHTML = `
      <div><strong>A:</strong> ${escapeHtml(item.claimA || "")}</div>
      <div><strong>B:</strong> ${escapeHtml(item.claimB || "")}</div>
      <div>${escapeHtml(item.explanation || "")}</div>
    `;
    list.append(card);
  });

  contradictionList.append(list);
}

function renderCredibilityNotes(items) {
  credibilityList.innerHTML = "";
  credibilityPanel.hidden = !items.length;
  if (!items.length) return;

  const list = document.createElement("div");
  list.className = "llm-detail-list";

  items.forEach((item) => {
    const card = document.createElement("div");
    const level = item.plausibility || "medium";
    card.className = "llm-detail-item";
    card.innerHTML = `
      <div>${escapeHtml(item.claim || "")}</div>
      <span class="credibility-tag" data-level="${escapeHtml(level)}">${escapeHtml(level)}</span>
      <div>${escapeHtml(item.reason || "")}</div>
    `;
    list.append(card);
  });

  credibilityList.append(list);
}

function renderRewriteSuggestion(text) {
  rewritePanel.hidden = !text;
  rewriteContent.textContent = text || "";
}

function renderVerification(verification) {
  if (!verificationSummary || !verificationChecks) return;

  const summary = document.getElementById("verificationCollapsibleSummary");

  if (!verification) {
    verificationSummary.textContent = t('verification.pendingDesc');
    renderList(verificationChecks, [t('verification.noResults')]);
    verificationChecks.dataset.overall = "idle";
    if (summary) summary.textContent = t('verification.statusPending');
    return;
  }

  const summaryMap = {
    pass: t('verification.overall.pass'),
    warn: t('verification.overall.warn'),
    fail: t('verification.overall.fail'),
  };

  verificationSummary.textContent = summaryMap[verification.overall] || t('verification.overallDone');
  verificationChecks.dataset.overall = verification.overall;
  renderList(
    verificationChecks,
    verification.checks.map((check) => `${verificationStatusLabel(check.status)} ${check.title}：${check.message}`),
  );

  const overallLabel = {
    pass: t('verification.overallLabel.pass'),
    warn: t('verification.overallLabel.warn'),
    fail: t('verification.overallLabel.fail'),
  };
  if (summary) {
    summary.textContent = t('verification.summaryCount', { label: overallLabel[verification.overall] || t('verification.overallLabel.done'), n: verification.checks.length });
  }
  autoExpandCard("verification");
}

function renderProgress(job) {
  if (!progressPanel || !progressLabel || !progressMessage || !progressFill) return;

  const status = job.stalled ? "stalled" : job.status;
  const labelMap = {
    idle: t('progress.labelIdle'),
    creating: t('progress.labelCreating'),
    queued: t('progress.labelQueued'),
    running: t('progress.labelRunning'),
    completed: t('progress.labelCompleted'),
    failed: t('progress.labelFailed'),
    stalled: t('progress.labelStalled'),
  };

  progressPanel.dataset.status = status;
  progressLabel.textContent = labelMap[status] || t('progress.labelDefault');
  if (progressStageText) {
    progressStageText.textContent = stageLabel(job.stage);
  }
  progressMessage.textContent = job.stalled
    ? t('msg.stalled', { msg: job.message })
    : job.message;
  if (progressTiming) {
    const elapsedMs = Number(job.elapsedMs || 0);
    progressTiming.textContent = elapsedMs ? formatElapsed(elapsedMs) : t('timing.zero');
  }
  progressFill.style.width = `${clamp(job.progress || 0)}%`;
  engineStatus.textContent =
    status === "completed"
      ? engineStatus.textContent
      : t('status.analyzing', { stage: stageLabel(job.stage), pct: Math.round(job.progress || 0) });
}

async function runLegacyAnalysis(requestPayload) {
  const stopTicker = startLegacyProgressTicker();
  let response = null;

  try {
    response = await apiFetch(apiUrl("/api/v1/analyze"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    if (response.status === 404) {
      response = await apiFetch(apiUrl("/api/analyze"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || t('msg.syncFailed'));
    }

    const normalized = normalizePayload(payload, { allowClientVerification: true });

    latestAnalysis = normalized;
    exportButton.disabled = false;
    renderResult(normalized.result);
    renderLlm(normalized.llm || null, normalized.meta?.llmService || null);
    renderLlmDetails(normalized.llm || null);
    renderVerification(normalized.verification || null);
    renderProgress({
      status: "completed",
      stage: "completed",
      progress: 100,
      elapsedMs: Date.now() - currentJobStartedAt,
      message: t('msg.syncFallback'),
    });
    engineStatus.textContent = t('status.connected', { version: normalized.meta?.engineVersion || "legacy-api" });
    applyHighlights(normalized.result?.signals || []);
    loadHistory();
  } catch (error) {
    if (localEngine) {
      await runLocalAnalysis(requestPayload, error.message || t('msg.syncFailed'));
      return;
    }
    throw error;
  } finally {
    stopTicker();
  }
}

async function runLocalAnalysis(requestPayload, reason) {
  renderProgress({
    status: "running",
    stage: "rule_engine",
    progress: 42,
    elapsedMs: Date.now() - currentJobStartedAt,
    message: reason
      ? t('msg.localFallback')
      : t('msg.localAnalyzing'),
  });
  await sleep(180);
  const payload = localEngine.analyze(requestPayload);
  latestAnalysis = payload;
  exportButton.disabled = false;
  renderResult(payload.result);
  renderLlm(payload.llm || null, payload.meta?.llmService || null);
  renderLlmDetails(payload.llm || null);
  renderVerification(payload.verification || null);
  renderProgress({
    status: "completed",
    stage: "completed",
    progress: 100,
    elapsedMs: Date.now() - currentJobStartedAt,
    message: t('msg.localDone'),
  });
  engineStatus.textContent = t('status.offline', { version: payload.meta.engineVersion });
  applyHighlights(payload.result?.signals || []);
  renderHistory(localEngine.loadHistory());
}

function startLegacyProgressTicker() {
  const stages = [
    {
      after: 0,
      stage: "classifying",
      progress: 14,
      message: t('msg.progressClassifying'),
    },
    {
      after: 900,
      stage: "rule_engine",
      progress: 32,
      message: t('msg.progressRuleEngine'),
    },
    {
      after: 2000,
      stage: "llm_enrichment",
      progress: 58,
      message: t('msg.progressLlm'),
    },
    {
      after: 6000,
      stage: "verification",
      progress: 76,
      message: t('msg.progressVerification'),
    },
  ];

  const interval = setInterval(() => {
    const elapsedMs = Date.now() - currentJobStartedAt;
    const stage = stages.reduce(
      (selected, candidate) => (elapsedMs >= candidate.after ? candidate : selected),
      stages[0],
    );

    renderProgress({
      status: "running",
      stage: stage.stage,
      progress: stage.progress,
      message: stage.message,
      elapsedMs,
      stalled: elapsedMs > 12000,
    });
  }, 450);

  return () => clearInterval(interval);
}

function renderClassification(classification) {
  if (!classification) {
    classificationStrip.innerHTML = `
      <span>${t('classification.langPending')}</span>
      <span>${t('classification.scenePending')}</span>
      <span>${t('classification.industryPending')}</span>
    `;
    return;
  }

  const sourceLabel = (source) => {
    if (source === "llm") return t('classification.sourceAI');
    if (source === "manual") return t('classification.sourceManual');
    return t('classification.sourceKeyword');
  };

  const contextSource = sourceLabel(classification.context.source);
  const sectorSource = sourceLabel(classification.sector.source);

  classificationStrip.innerHTML = `
    <span>${t('classification.langLine', { lang: classification.language.label })}</span>
    <span>${t('classification.sceneLine', { label: classification.context.label, source: contextSource })}</span>
    <span>${t('classification.industryLine', { label: classification.sector.label, source: sectorSource })}</span>
  `;
}

function updateBreakdown(key, value) {
  bars[key].style.width = `${clamp(value * 2.7)}%`;
  values[key].textContent = Math.round(value);
}

function updateEvidence(evidence) {
  Object.entries(evidenceItems).forEach(([key, element]) => {
    element.classList.toggle("present", evidence[key]);
    element.classList.toggle("missing", !evidence[key]);
  });
}

function renderList(target, items) {
  target.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    target.append(li);
  });
}

function setBusy(isBusy) {
  const submitButton = form.querySelector("button[type='submit']");
  const resultPanel = document.querySelector(".result-panel");
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? t('btn.analyzing') : t('btn.startAnalysis');
  if (isBusy) {
    resultPanel.classList.add("analyzing");
    hideWelcome();
  } else {
    resultPanel.classList.remove("analyzing");
  }
}

function hideWelcome() {
  const welcomePanel = document.getElementById("welcomePanel");
  const resultPanel = document.querySelector(".result-panel");
  if (welcomePanel) welcomePanel.hidden = true;
  if (resultPanel) resultPanel.classList.add("has-results");
}

function showWelcome() {
  const welcomePanel = document.getElementById("welcomePanel");
  const resultPanel = document.querySelector(".result-panel");
  if (welcomePanel) welcomePanel.hidden = false;
  if (resultPanel) resultPanel.classList.remove("has-results");
}

function exportLatestAnalysis() {
  if (!latestAnalysis) return;

  const blob = new Blob([JSON.stringify(latestAnalysis, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `greenwashing-analysis-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadHealth() {
  try {
    const response = await apiFetch(apiUrl("/api/health"));
    const payload = await response.json();
    llmAvailable = Boolean(payload.llmService?.enabled);
    nlpServiceAvailable = Boolean(payload.nlpService?.available);
    engineStatus.textContent = t('status.connected', { version: payload.engineVersion });
    if (payload.storage?.historyEnabled === false) {
      engineStatus.textContent += t('status.historyDisabled');
    }
    updateHistorySummaryButton();
  } catch {
    if (localEngine) {
      const payload = localEngine.health();
      llmAvailable = Boolean(payload.llmService?.enabled);
      nlpServiceAvailable = Boolean(payload.nlpService?.available);
      engineStatus.textContent = t('status.offline', { version: payload.engineVersion });
      updateHistorySummaryButton();
      return;
    }
    llmAvailable = false;
    nlpServiceAvailable = false;
    engineStatus.textContent = fileModeHint();
    updateHistorySummaryButton();
  }
}

function updateHistorySummaryButton() {
  if (!historySummaryButton) return;
  historySummaryButton.disabled = !llmAvailable;
  historySummaryButton.title = llmAvailable ? "" : t('history.trendSummaryTitle');
  updateDeepAnalyzeButton();
}

async function summarizeHistoryTrends() {
  if (!llmAvailable) return;

  try {
    historySummary.hidden = false;
    historySummary.textContent = t('msg.progressTrendGenerating');
    const response = await apiFetch(apiUrl("/api/v1/history/summary"), {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || t('msg.trendFailed'));
    }

    if (!payload?.summary) {
      historySummary.textContent = t('msg.trendNoResult');
      return;
    }

    historySummary.textContent = payload.summary;
  } catch (error) {
    historySummary.hidden = false;
    historySummary.textContent = error.message || t('msg.trendFailedFull');
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  if (isDesktopMode || isLocalAppHost) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});

    if ("caches" in window) {
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {});
    }
    return;
  }

  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

function formatDate(value) {
  const locale = window.i18n?.getLang() === 'en' ? 'en-US' : 'zh-CN';
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));

  if (totalSeconds < 60) {
    return t('timing.seconds', { n: totalSeconds });
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return t('timing.minutesSeconds', { m: minutes, s: seconds });
}

function labelForContext(value) {
  const key = `context.${value}`;
  const fallback = t('context.general');
  const result = t(key);
  return result === key ? fallback : result;
}

function labelForSector(value) {
  const key = `sector.${value}`;
  const fallback = t('sector.default');
  const result = t(key);
  return result === key ? fallback : result;
}

function verificationStatusLabel(status) {
  if (status === "pass") return t('verification.statusLabel.pass');
  if (status === "warn") return t('verification.statusLabel.warn');
  return t('verification.statusLabel.fail');
}

function stageLabel(stage) {
  const keyMap = {
    idle: 'stage.idle',
    creating: 'stage.creating',
    queued: 'stage.queued',
    classifying: 'stage.classifying',
    scoring: 'stage.scoring',
    "nlp-local": 'stage.nlpLocal',
    "nlp-skip": 'stage.nlpSkip',
    llm: 'stage.llm',
    rule_engine: 'stage.ruleEngine',
    rule_preview: 'stage.rulePreview',
    llm_enrichment: 'stage.llmEnrichment',
    verification: 'stage.verification',
    saving: 'stage.saving',
    fallback: 'stage.fallback',
    completed: 'stage.completed',
    failed: 'stage.failed',
  };

  return keyMap[stage] ? t(keyMap[stage]) : t('stage.default');
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveApiBase() {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("apiBase");

  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  if (window.location.protocol === "file:") {
    return DEFAULT_LOCAL_API_BASE;
  }

  return window.location.origin.replace(/\/+$/, "");
}

function apiUrl(pathname) {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${apiBase}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function fileModeHint() {
  if (window.location.protocol === "file:") {
    return t('msg.fileMode', { base: apiBase });
  }

  return t('msg.stalledHint');
}

function buildUnavailableMessage() {
  if (window.location.protocol === "file:") {
    return t('msg.fileModeUnavailable', { base: apiBase });
  }

  return t('msg.serviceUnavailable');
}

function normalizePayload(payload, { allowClientVerification = false } = {}) {
  if (!payload || payload.verification || !allowClientVerification) {
    return payload;
  }

  return {
    ...payload,
    verification: buildClientVerification(payload),
  };
}

function buildClientVerification(payload) {
  const checks = [];
  const classification = payload.classification || payload.result?.classification;
  const result = payload.result;
  const llm = payload.llm;

  if (classification?.context) {
    checks.push(buildClientClassificationCheck(t('classification.contextSector.context.title'), classification.context));
  }

  if (classification?.sector) {
    checks.push(buildClientClassificationCheck(t('classification.contextSector.sector.title'), classification.sector));
  }

  if (result) {
    checks.push(
      result.confidence < 55
        ? {
            id: "rule_confidence_low",
            status: "warn",
            title: t('clientVerif.ruleConfidenceLow.title'),
            message: t('clientVerif.ruleConfidenceLow.msg'),
          }
        : {
            id: "rule_confidence_ok",
            status: "pass",
            title: t('clientVerif.ruleConfidenceOk.title'),
            message: t('clientVerif.ruleConfidenceOk.msg', { pct: Math.round(result.confidence) }),
          },
    );
  }

  if (!llm || !llm.enabled) {
    checks.push({
      id: "llm_disabled",
      status: "warn",
      title: t('clientVerif.llmDisabled.title'),
      message: llm?.error
        ? t('clientVerif.llmError.msg', { error: llm.error })
        : t('clientVerif.llmDisabled.msg'),
    });
  } else {
    checks.push({
      id: "llm_enabled",
      status: "pass",
      title: t('clientVerif.llmEnabled.title'),
      message: t('clientVerif.llmEnabled.msg', { provider: llm.provider, model: llm.model }),
    });

    if (Number.isFinite(llm.adjustedRisk) && result) {
      const gap = Math.abs(llm.adjustedRisk - result.risk);
      checks.push({
        id: "llm_gap",
        status: gap > 25 ? "warn" : "pass",
        title: t('clientVerif.llmGap.title'),
        message:
          gap > 25
            ? t('clientVerif.llmGap.warnMsg', { gap })
            : t('clientVerif.llmGap.okMsg', { gap }),
      });
    }
  }

  const overall = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  return {
    overall,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

function buildAnalysisNote(result) {
  if (result.decisionMode === "non-green-claim-baseline") {
    return t('analysisNote.nonGreen', { prob: Math.round(result.claimProb), threshold: result.claimThreshold || 42, risk: Math.round(result.risk) });
  }

  if (result.decisionMode === "green-claim-risk") {
    return t('analysisNote.greenClaim');
  }

  return t('analysisNote.default');
}

function buildClientClassificationCheck(title, part) {
  const confidence = part?.detected?.confidence ?? 0;

  if (part?.source === "manual") {
    return {
      id: `${title}-manual`,
      status: "pass",
      title,
      message: t('clientVerif.manualOverride'),
    };
  }

  if (confidence < 0.55) {
    return {
      id: `${title}-low`,
      status: "warn",
      title,
      message: t('clientVerif.lowConfidence', { pct: Math.round(confidence * 100) }),
    };
  }

  return {
    id: `${title}-ok`,
    status: "pass",
    title,
    message: t('clientVerif.okConfidence', { pct: Math.round(confidence * 100) }),
  };
}

function setupThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  const stored = localStorage.getItem("greenwashing-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored || (prefersDark ? "dark" : "light");

  applyTheme(theme);

  toggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("greenwashing-theme", next);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("greenwashing-theme")) {
      applyTheme(e.matches ? "dark" : "light");
    }
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = theme === "dark" ? "#121817" : "#177e89";
  }
}

function rerenderDynamicI18n() {
  // Re-render UI elements that were set with t() dynamically.
  // Static data-i18n elements are handled by applyStaticI18n().
  if (latestAnalysis) {
    const payload = normalizePayload(latestAnalysis);
    if (payload?.result) renderResult(payload.result);
    renderLlm(payload?.llm || null, payload?.meta?.llmService || null);
    renderLlmDetails(payload?.llm || null);
    renderVerification(payload?.verification || null);
  }
  loadHistory();
  // Re-render classification status
  if (smartClassificationState) {
    const contextLabel = labelForContext(contextType?.value);
    const sectorLabel = labelForSector(sector?.value);
    const methodLabel = t('classification.sourceAI');
    setClassificationStatus(t('classification.aiIdentified', { method: methodLabel, context: contextLabel, sector: sectorLabel }), "success");
  } else {
    setClassificationStatus(t('classification.autoHint'));
  }
  updateMasterButton();
  updateDeepAnalyzeButton();
}

function setupLangToggle() {
  const langToggle = document.getElementById('langToggle');
  if (!langToggle) return;
  langToggle.addEventListener('click', () => {
    const next = window.i18n.getLang() === 'zh' ? 'en' : 'zh';
    window.i18n.setLang(next);
    rerenderDynamicI18n();
  });
}

function setupPdfUpload() {
  if (!pdfUploadZone || !pdfFileInput || !pdfUploadStatus) return;

  if (window.location.protocol === "file:" && !isDesktopMode) {
    pdfUploadZone.hidden = true;
    return;
  }

  pdfUploadZone.addEventListener("click", () => {
    pdfFileInput.click();
  });

  pdfUploadZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pdfFileInput.click();
    }
  });

  pdfFileInput.addEventListener("change", () => {
    const file = pdfFileInput.files[0];
    if (file) handlePdfFile(file);
    pdfFileInput.value = "";
  });

  pdfUploadZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    pdfUploadZone.classList.add("dragover");
  });

  pdfUploadZone.addEventListener("dragleave", () => {
    pdfUploadZone.classList.remove("dragover");
  });

  pdfUploadZone.addEventListener("drop", (event) => {
    event.preventDefault();
    pdfUploadZone.classList.remove("dragover");
    const file = event.dataTransfer.files[0];
    if (file) handlePdfFile(file);
  });
}

async function handlePdfFile(file) {
  if (!pdfUploadZone || !pdfUploadStatus) return;

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setPdfUploadState("error", t('pdf.errorFormat'));
    setTimeout(() => setPdfUploadState("idle"), 3000);
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    setPdfUploadState("error", t('pdf.errorSize'));
    setTimeout(() => setPdfUploadState("idle"), 3000);
    return;
  }

  setPdfUploadState("processing", t('pdf.processing'));

  try {
    const response = await apiFetch(apiUrl("/api/v1/upload-pdf"), {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Filename": encodeURIComponent(file.name),
      },
      body: file,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || t('pdf.extractFailed'));
    }

    resetClassificationControls({ resetSelects: true });
    textArea.value = data.text;
    updatePdfUploadVisibility();
    renderDocument(data.document || null);
    const engineLabel = data.engine === "poppler" ? t('pdf.engineSystem') : t('pdf.engineJs');
    const warnings = data.warnings || [];
    let statusMsg = t('pdf.extracted', { chars: data.text.length, engine: engineLabel });
    if (warnings.length) {
      statusMsg += t('pdf.optimized');
    }
    statusMsg += ` · ${file.name}`;
    setPdfUploadState("success", statusMsg);
    await classifyCurrentText({ force: true, reason: "pdf" });

    pdfSourceMode = true;

    setTimeout(() => setPdfUploadState("idle"), warnings.length ? 8000 : 5000);
  } catch (error) {
    setPdfUploadState("error", error.message || t('pdf.extractError'));
    setTimeout(() => setPdfUploadState("idle"), 5000);
  }
}

let currentDocument = null;

// Stores sentence char-offset boundaries per <p> element, used by applyHighlights
const paraSentBounds = new WeakMap();

function computeSentenceBounds(text) {
  const bounds = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?。！？…]+\s*|\n+/g)) {
    const sentEnd = m.index + m[0].trimEnd().length;
    if (sentEnd > start) bounds.push({ start, end: sentEnd });
    start = m.index + m[0].length;
  }
  if (start < text.length) bounds.push({ start, end: text.length });
  return bounds;
}

const READER_CHARS_PER_PAGE = 2200;

function paginateBlocks(doc) {
  const pages = [];
  let page = [];
  let chars = 0;
  for (const block of doc) {
    if (block.hiddenByDefault) continue;
    const len = block.type === "paragraph"
      ? block.text.length
      : (block.rows || []).join("").length;
    if (chars > 0 && chars + len > READER_CHARS_PER_PAGE) {
      pages.push(page);
      page = [];
      chars = 0;
    }
    page.push(block);
    chars += len;
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

function renderDocument(doc) {
  if (!docViewerBody) return;
  currentDocument = doc;

  if (!doc || !doc.length) {
    if (docViewer) docViewer.hidden = true;
    return;
  }

  docViewerBody.innerHTML = "";
  const pages = paginateBlocks(doc);
  const total = pages.length;

  pages.forEach((blocks, i) => {
    const pageEl = document.createElement("div");
    pageEl.className = "doc-page";

    let lastPdfPage = null;
    blocks.forEach((block) => {
      if (block.page && block.page !== lastPdfPage) {
        const marker = document.createElement("span");
        marker.className = "doc-pdf-page-marker";
        marker.textContent = t('docviewer.pageMarker', { n: block.page });
        pageEl.append(marker);
        lastPdfPage = block.page;
      }
      if (block.type === "paragraph") {
        const p = document.createElement("p");
        p.className = "doc-para";
        p.textContent = block.text;
        paraSentBounds.set(p, computeSentenceBounds(block.text));
        pageEl.append(p);
      } else if (block.type === "table") {
        const wrapper = document.createElement("div");
        wrapper.className = "doc-table";
        const label = document.createElement("span");
        label.className = "doc-table-label";
        label.textContent = t('docviewer.tableLabel');
        wrapper.append(label);
        const pre = document.createElement("pre");
        pre.textContent = block.rows.join("\n");
        wrapper.append(pre);
        pageEl.append(wrapper);
      }
    });

    if (total > 1) {
      const num = document.createElement("p");
      num.className = "doc-page-number";
      num.textContent = t('docviewer.pageNumber', { current: i + 1, total });
      pageEl.append(num);
    }

    docViewerBody.append(pageEl);
  });

  if (docViewer) {
    docViewer.hidden = false;
    docViewerBody?.scrollTo(0, 0);
  }
}

function applyHighlights(signals) {
  if (typeof CSS !== "undefined" && CSS.highlights) CSS.highlights.clear();
  if (!docViewerBody || !currentDocument) return;

  const signalMap = new Map();
  if (Array.isArray(signals)) {
    signals.forEach((s) => {
      const colonIdx = s.indexOf(": ");
      if (colonIdx === -1) return;
      const prefix = s.slice(0, colonIdx);
      const term = s.slice(colonIdx + 2);
      if (!term) return;
      if (prefix.includes("绿色声明") || prefix.includes("green")) {
        signalMap.set(term, "green");
      } else if (prefix.includes("模糊")) {
        signalMap.set(term, "vague");
      } else if (prefix.includes("断言") || prefix.includes("absolute")) {
        signalMap.set(term, "absolute");
      } else if (prefix.includes("承诺") || prefix.includes("future")) {
        signalMap.set(term, "future");
      }
    });
  }

  if (!signalMap.size || typeof CSS === "undefined" || !CSS.highlights) return;

  const TYPES = ["green", "vague", "absolute", "future"];
  const termRanges = Object.fromEntries(TYPES.map((t) => [t, []]));
  // Maps keyed by "start-end" string to deduplicate ranges within same text node
  const sentKeys = Object.fromEntries(TYPES.map((t) => [t, new Set()]));
  const ctxKeys  = Object.fromEntries(TYPES.map((t) => [t, new Set()]));
  const sentRanges = Object.fromEntries(TYPES.map((t) => [t, []]));
  const ctxRanges  = Object.fromEntries(TYPES.map((t) => [t, []]));

  const walker = document.createTreeWalker(docViewerBody, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const text = node.textContent;
    const para = node.parentElement?.closest(".doc-para");
    const bounds = para ? paraSentBounds.get(para) : null;

    signalMap.forEach((type, term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      let match;
      while ((match = regex.exec(text)) !== null) {
        const mStart = match.index;
        const mEnd = mStart + match[0].length;

        // Term-level range
        const tr = new Range();
        tr.setStart(node, mStart);
        tr.setEnd(node, mEnd);
        termRanges[type].push(tr);

        if (!bounds) return;

        // Find containing sentence
        const sentIdx = bounds.findIndex((b) => b.start <= mStart && b.end >= mEnd);
        if (sentIdx === -1) return;
        const sb = bounds[sentIdx];
        const sKey = `${sb.start}-${sb.end}`;

        if (!sentKeys[type].has(sKey)) {
          sentKeys[type].add(sKey);
          const sr = new Range();
          sr.setStart(node, sb.start);
          sr.setEnd(node, sb.end);
          sentRanges[type].push(sr);
        }

        // Adjacent context sentences
        const allSentKeys = TYPES.flatMap((t) => [...sentKeys[t]]);
        for (const ctxIdx of [sentIdx - 1, sentIdx + 1]) {
          if (ctxIdx < 0 || ctxIdx >= bounds.length) continue;
          const cb = bounds[ctxIdx];
          const cKey = `${cb.start}-${cb.end}`;
          if (allSentKeys.includes(cKey)) continue;
          if (ctxKeys[type].has(cKey)) continue;
          ctxKeys[type].add(cKey);
          const cr = new Range();
          cr.setStart(node, cb.start);
          cr.setEnd(node, cb.end);
          ctxRanges[type].push(cr);
        }
      }
    });
  });

  TYPES.forEach((type) => {
    if (termRanges[type].length) {
      const h = new Highlight(...termRanges[type]);
      h.priority = 2;
      CSS.highlights.set(`term-${type}`, h);
    }
    if (sentRanges[type].length) {
      const h = new Highlight(...sentRanges[type]);
      h.priority = 1;
      CSS.highlights.set(`sent-${type}`, h);
    }
    if (ctxRanges[type].length) {
      const h = new Highlight(...ctxRanges[type]);
      h.priority = 0;
      CSS.highlights.set(`ctx-${type}`, h);
    }
  });
}

docViewerClose.addEventListener("click", () => {
  if (docViewer) docViewer.hidden = true;
});

function updatePdfUploadVisibility() {
  if (!pdfUploadZone) return;
  pdfUploadZone.classList.toggle("has-text", textArea.value.trim().length > 0);
}

textArea.addEventListener("input", () => {
  updatePdfUploadVisibility();
  scheduleSmartClassification();
});

[contextType, sector].forEach((select) => {
  select.addEventListener("change", () => {
    if (applyingSmartClassification) {
      return;
    }

    smartClassificationState = null;
    if (select === contextType) {
      classificationSelectionMode.context = contextType.value === "auto" ? "auto" : "manual";
    }
    if (select === sector) {
      classificationSelectionMode.sector = sector.value === "auto" ? "auto" : "manual";
    }
    lastClassifiedText = "";

    if (!isManualClassificationField("context") || !isManualClassificationField("sector")) {
      scheduleSmartClassification();
      return;
    }
    setClassificationStatus(t('classification.manualHint'));
  });
});

function setPdfUploadState(state, message) {
  if (!pdfUploadZone || !pdfUploadStatus) return;
  pdfUploadZone.className = "pdf-upload-zone";
  pdfUploadStatus.hidden = true;
  pdfUploadStatus.className = "pdf-upload-status";

  if (state !== "idle") {
    pdfUploadZone.classList.add(state);
    pdfUploadStatus.hidden = false;
    pdfUploadStatus.classList.add(state);
    pdfUploadStatus.textContent = message;
  }
}

// ── (Evidence panel removed — merged into v2 unified flow) ──
// Functions removed: updateEvidenceBadge, setupEvidenceUpload,
// autofillEvidencePanel, runEvidenceVerification, loadEvidenceReport,
// renderEvidenceReport.


// ── Deep Analysis (M3/M4/M5) ──

const DEEP_RISK_LEVEL_MAP = {
  "低风险": "low",
  "中低风险": "medium-low",
  "中高风险": "medium-high",
  "高风险": "high",
};

function updateDeepAnalyzeButton() {
  const btn = document.getElementById("deepAnalyzeButton");
  if (!btn) return;
  const hasResult = !!latestAnalysis?.result;
  btn.disabled = !llmAvailable || !hasResult;
  if (!llmAvailable) {
    btn.title = t('deep.btnNeedsModel');
  } else if (!hasResult) {
    btn.title = t('deep.btnNeedsAnalysis');
  } else {
    btn.title = t('deep.btnReady');
  }
}

async function runDeepAnalysis() {
  const btn = document.getElementById("deepAnalyzeButton");
  if (!btn || btn.disabled) return;
  if (!latestAnalysis?.text && !document.getElementById("claimText")?.value?.trim()) {
    return;
  }
  const text = latestAnalysis?.text || document.getElementById("claimText").value.trim();
  const classification = latestAnalysis?.classification || null;

  btn.disabled = true;
  const originalText = btn.firstChild?.textContent;
  // briefly indicate loading
  btn.classList.add("is-loading");
  try {
    const resp = await fetch(apiUrl("/deep-analyze"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, classification }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    renderDeepResult(data);
    // Switch to advanced tab so user sees the result
    activateResultTab("advanced");
  } catch (err) {
    const section = document.getElementById("deepResultSection");
    if (section) {
      section.hidden = false;
      const reason = document.getElementById("deepConfidenceReason");
      if (reason) reason.textContent = t('deep.errorPrefix') + err.message;
    }
  } finally {
    btn.classList.remove("is-loading");
    updateDeepAnalyzeButton();
  }
}

function renderDeepResult(data) {
  const section = document.getElementById("deepResultSection");
  if (!section || !data) return;
  section.hidden = false;

  // Provider line
  const prov = document.getElementById("deepResultProvider");
  if (prov) {
    const meta = data._meta || {};
    prov.textContent = meta.enabled
      ? `${meta.provider || ""}${meta.model ? " · " + meta.model : ""}`
      : t('deep.noModel');
  }

  // Gate
  const gate = data.gate || {};
  const gateEl = document.getElementById("deepGate");
  const gateResult = document.getElementById("deepGateResult");
  const gateDirection = document.getElementById("deepGateDirection");
  const gateTypes = document.getElementById("deepGateTypes");
  if (gateEl) {
    gateEl.hidden = !(gate.gate_result || gate.claim_direction || (gate.text_types && gate.text_types.length));
  }
  if (gateResult) gateResult.textContent = gate.gate_result || "";
  if (gateDirection) gateDirection.textContent = gate.claim_direction || "";
  if (gateTypes) gateTypes.textContent = (gate.text_types || []).join(" / ");

  // Modules
  const modules = data.modules || {};
  const renderModule = (id, mod, detailFmt) => {
    const score = Math.round(Number(mod?.score) || 0);
    const scoreEl = document.getElementById(`deep${id}Score`);
    const barEl = document.getElementById(`deep${id}Bar`);
    const detailEl = document.getElementById(`deep${id}Detail`);
    if (scoreEl) scoreEl.textContent = score;
    if (barEl) barEl.style.width = `${score}%`;
    if (detailEl) detailEl.textContent = detailFmt(mod || {});
  };
  renderModule("M3", modules.M3_vagueness, (m) => {
    const ratio = m.vagueness_ratio != null ? `${Math.round(m.vagueness_ratio * 100)}%` : "—";
    const vw = (m.vague_words_found || []).slice(0, 4).join("、") || t('deep.m3NoWords');
    return t('deep.m3Detail', { ratio, words: vw });
  });
  renderModule("M4", modules.M4_promotional_framing, (m) => {
    const ps = (m.positive_signals || []).length;
    const bs = (m.balance_signals || []).length;
    return t('deep.m4Detail', { ps, bs });
  });
  renderModule("M5", modules.M5_commitment_action, (m) => {
    const avg = m.average_level != null ? m.average_level.toFixed(1) : "—";
    const worst = m.worst_level != null ? m.worst_level : "—";
    return t('deep.m5Detail', { avg, worst, pct: Math.round((m.level1_share || 0) * 100) });
  });

  // Scoring
  const scoring = data.scoring || {};
  const tgriEl = document.getElementById("deepTGRI");
  const badgeEl = document.getElementById("deepRiskBadge");
  const typeEl = document.getElementById("deepPrimaryType");
  if (tgriEl) tgriEl.textContent = Math.round(Number(scoring.TGRI) || 0);
  if (badgeEl) {
    badgeEl.textContent = scoring.risk_level || "—";
    badgeEl.setAttribute("data-level", DEEP_RISK_LEVEL_MAP[scoring.risk_level] || "medium-high");
  }
  if (typeEl) typeEl.textContent = scoring.primary_type || "";

  // Claims
  const claims = data.claims || [];
  const countEl = document.getElementById("deepClaimsCount");
  const listEl = document.getElementById("deepClaimsList");
  if (countEl) countEl.textContent = claims.length;
  if (listEl) {
    listEl.className = "deep-claims-list";
    listEl.innerHTML = "";
    claims.forEach((c) => {
      const card = document.createElement("div");
      card.className = "deep-claim-card";
      const meta = document.createElement("div");
      meta.className = "deep-claim-meta";
      const tagType = document.createElement("span");
      tagType.className = "claim-type-tag";
      tagType.textContent = c.claim_type || "—";
      meta.appendChild(tagType);
      const tagLevel = document.createElement("span");
      tagLevel.className = "claim-level-tag";
      tagLevel.setAttribute("data-level", String(c.level || ""));
      tagLevel.textContent = `L${c.level || "?"} ${c.level_label || ""}`.trim();
      meta.appendChild(tagLevel);
      if (c.specificity) {
        const tagSpec = document.createElement("span");
        tagSpec.className = "claim-type-tag";
        tagSpec.textContent = t('deep.specificity', { value: c.specificity });
        meta.appendChild(tagSpec);
      }
      card.appendChild(meta);
      const textP = document.createElement("p");
      textP.className = "deep-claim-text";
      textP.textContent = c.text || "";
      card.appendChild(textP);
      if (c.reasoning) {
        const reasonP = document.createElement("p");
        reasonP.className = "deep-claim-reasoning";
        reasonP.textContent = c.reasoning;
        card.appendChild(reasonP);
      }
      listEl.appendChild(card);
    });
    if (!claims.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = t('deep.noClaims');
      listEl.appendChild(empty);
    }
  }

  // Summary
  const summary = data.summary || {};
  const findingsEl = document.getElementById("deepKeyFindings");
  const recsEl = document.getElementById("deepRecommendations");
  if (findingsEl) {
    findingsEl.innerHTML = "";
    (summary.key_findings || []).forEach((f) => {
      const li = document.createElement("li");
      li.textContent = f;
      findingsEl.appendChild(li);
    });
    if (!(summary.key_findings || []).length) {
      const li = document.createElement("li");
      li.textContent = t('deep.noResults');
      findingsEl.appendChild(li);
    }
  }
  if (recsEl) {
    recsEl.innerHTML = "";
    (summary.recommendations || []).forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r;
      recsEl.appendChild(li);
    });
    if (!(summary.recommendations || []).length) {
      const li = document.createElement("li");
      li.textContent = t('deep.noResults');
      recsEl.appendChild(li);
    }
  }

  // QC
  const qc = data.quality_control || {};
  const confEl = document.getElementById("deepConfidence");
  const confReasonEl = document.getElementById("deepConfidenceReason");
  if (confEl) confEl.textContent = `${Math.round((qc.confidence || 0) * 100)}%`;
  if (confReasonEl) confReasonEl.textContent = qc.confidence_reason || "";

  // Auto-expand parent collapsible (result-panel) if collapsed
  autoExpandCard("result");
}

function setupDeepAnalyze() {
  const btn = document.getElementById("deepAnalyzeButton");
  if (!btn) return;
  btn.addEventListener("click", runDeepAnalysis);
  updateDeepAnalyzeButton();
}

// ── Settings Drawer ──

const PROVIDER_KEYS = ["openai", "claude", "gemini", "deepseek"];
let _settingsCachedState = null;

async function loadSettings() {
  try {
    const resp = await fetch(apiUrl("/settings"));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    _settingsCachedState = data;
    // populate provider radios
    const radios = document.querySelectorAll('input[name="settingsProvider"]');
    radios.forEach((r) => { r.checked = r.value === (data.provider || "none"); });
    const secRadios = document.querySelectorAll('input[name="settingsSecondaryProvider"]');
    secRadios.forEach((r) => { r.checked = r.value === (data.secondaryProvider || "none"); });
    // populate each provider group
    for (const p of PROVIDER_KEYS) {
      const info = data.providers?.[p] || { configured: false, model: "" };
      const cap = p.charAt(0).toUpperCase() + p.slice(1);
      const statusEl = document.getElementById(`settingsStatus${cap}`);
      const keyEl = document.getElementById(`settings${cap}Key`);
      const modelEl = document.getElementById(`settings${cap}Model`);
      if (statusEl) {
        statusEl.textContent = info.configured ? t('settings.configured') : t('settings.unconfigured');
        statusEl.classList.toggle("is-configured", !!info.configured);
      }
      if (keyEl) keyEl.value = ""; // always start blank
      if (modelEl) modelEl.value = info.model || "";
    }
    const timeoutEl = document.getElementById("settingsTimeout");
    if (timeoutEl) timeoutEl.value = data.timeoutMs || 30000;
    return data;
  } catch (err) {
    const msg = document.getElementById("settingsMessage");
    if (msg) {
      msg.textContent = t('settings.loadFailed', { error: err.message });
      msg.setAttribute("data-status", "err");
    }
    return null;
  }
}

function openSettingsDrawer() {
  const drawer = document.getElementById("settingsDrawer");
  const backdrop = document.getElementById("settingsBackdrop");
  if (!drawer || !backdrop) return;
  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  const msg = document.getElementById("settingsMessage");
  if (msg) { msg.textContent = ""; msg.removeAttribute("data-status"); }
  loadSettings();
  // focus first focusable
  setTimeout(() => {
    const firstRadio = drawer.querySelector('input[type="radio"]:checked, input[type="radio"]');
    if (firstRadio) firstRadio.focus();
  }, 50);
}

function closeSettingsDrawer() {
  const drawer = document.getElementById("settingsDrawer");
  const backdrop = document.getElementById("settingsBackdrop");
  if (!drawer || !backdrop) return;
  drawer.hidden = true;
  backdrop.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  document.getElementById("settingsOpenButton")?.focus();
}

async function saveAndTestSettings() {
  const msg = document.getElementById("settingsMessage");
  const saveBtn = document.getElementById("settingsSaveButton");
  if (msg) { msg.textContent = t('settings.saving'); msg.setAttribute("data-status", "info"); }
  if (saveBtn) saveBtn.disabled = true;

  // Build updates payload
  const provider = document.querySelector('input[name="settingsProvider"]:checked')?.value || "none";
  const secondaryProvider = document.querySelector('input[name="settingsSecondaryProvider"]:checked')?.value || "none";
  const payload = { provider, secondaryProvider, providers: {} };
  const timeoutEl = document.getElementById("settingsTimeout");
  if (timeoutEl && timeoutEl.value) {
    const t = Number(timeoutEl.value);
    if (Number.isFinite(t)) payload.timeoutMs = t;
  }
  for (const p of PROVIDER_KEYS) {
    const cap = p.charAt(0).toUpperCase() + p.slice(1);
    const keyEl = document.getElementById(`settings${cap}Key`);
    const modelEl = document.getElementById(`settings${cap}Model`);
    const entry = {};
    if (keyEl && keyEl.value.trim()) entry.apiKey = keyEl.value;
    if (modelEl && modelEl.value.trim()) entry.model = modelEl.value.trim();
    if (Object.keys(entry).length) payload.providers[p] = entry;
  }

  try {
    const putResp = await fetch(apiUrl("/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const putBody = await putResp.json();
    if (!putResp.ok) throw new Error(putBody.error || `HTTP ${putResp.status}`);

    // Reload state in UI
    _settingsCachedState = putBody;
    await loadSettings();

    if (provider === "none") {
      if (msg) { msg.textContent = t('settings.savedNoProvider'); msg.setAttribute("data-status", "ok"); }
    } else {
      // Test connection
      if (msg) { msg.textContent = t('settings.savedTesting'); msg.setAttribute("data-status", "info"); }
      try {
        const testResp = await fetch(apiUrl("/llm/test"), { method: "POST" });
        const testBody = await testResp.json();
        if (testResp.ok && testBody.ok) {
          if (msg) { msg.textContent = t('settings.savedConnected', { provider }); msg.setAttribute("data-status", "ok"); }
        } else {
          if (msg) { msg.textContent = t('settings.savedTestFailed', { error: testBody.error || "unknown" }); msg.setAttribute("data-status", "err"); }
        }
      } catch (testErr) {
        if (msg) { msg.textContent = t('settings.savedTestError', { error: testErr.message }); msg.setAttribute("data-status", "err"); }
      }
    }
    loadHealth();
  } catch (err) {
    if (msg) { msg.textContent = t('settings.saveFailed', { error: err.message }); msg.setAttribute("data-status", "err"); }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function setupSettingsDrawer() {
  document.getElementById("settingsOpenButton")?.addEventListener("click", openSettingsDrawer);
  document.getElementById("settingsCloseButton")?.addEventListener("click", closeSettingsDrawer);
  document.getElementById("settingsCancelButton")?.addEventListener("click", closeSettingsDrawer);
  document.getElementById("settingsBackdrop")?.addEventListener("click", closeSettingsDrawer);
  document.getElementById("settingsSaveButton")?.addEventListener("click", saveAndTestSettings);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const drawer = document.getElementById("settingsDrawer");
      if (drawer && !drawer.hidden) closeSettingsDrawer();
    }
  });
  // Toggle password visibility
  document.querySelectorAll(".settings-toggle-key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) input.type = input.type === "password" ? "text" : "password";
    });
  });
}

// ── Result Tabs ──

function setupResultTabs() {
  const tabs = document.querySelectorAll(".result-tab");
  const panels = document.querySelectorAll(".result-tab-panel");
  if (!tabs.length) return;

  function switchTab(tabName) {
    tabs.forEach((t) => {
      const active = t.dataset.tab === tabName;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach((p) => {
      p.classList.toggle("is-active", p.dataset.tab === tabName);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchTab(tab.dataset.tab);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const all = Array.from(tabs);
        const idx = all.indexOf(tab);
        const next = e.key === "ArrowRight"
          ? all[(idx + 1) % all.length]
          : all[(idx - 1 + all.length) % all.length];
        next.focus();
        switchTab(next.dataset.tab);
      }
    });
  });
}

function activateResultTab(tabName) {
  const tab = document.querySelector(`.result-tab[data-tab="${tabName}"]`);
  if (tab) tab.click();
}

// ── Card Collapse / Resize System ──

function setupCardCollapse() {
  const STORAGE_KEY = "greenwashing-collapsed-cards-v1";
  const RESIZABLE = { input: 1, result: 1, history: 1 };
  const EXISTING_HEADER = { history: ".panel-heading" };

  document.body.classList.add("no-anim");
  const entries = [];

  document.querySelectorAll("[data-collapsible]").forEach((card) => {
    const id = card.dataset.cardId;
    if (!id) return;
    const title = card.dataset.cardTitle || id;
    const summaryId = card.dataset.cardSummaryId || "";
    let headerEl;

    if (EXISTING_HEADER[id]) {
      headerEl = card.querySelector(EXISTING_HEADER[id]);
      if (!headerEl) return;
      wrapAfter(card, headerEl);
    } else {
      headerEl = mkHeader(title, summaryId);
      wrapAll(card, headerEl);
    }

    const btn = mkBtn();
    headerEl.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCard(card);
    });
    headerEl.addEventListener("click", (e) => {
      if (e.target.closest(".card-collapse-btn, button, a, select, input, textarea")) return;
      toggleCard(card);
    });

    card.classList.add("card-collapsible");
    if (RESIZABLE[id]) card.classList.add("resizable");
    entries.push({ card, id, btn });
  });

  restoreStates(entries, STORAGE_KEY);
  // Remove .no-anim after the next paint so initial state restoration doesn't animate.
  // Use both rAF and setTimeout fallback (rAF may not fire in headless/background tabs).
  const clearNoAnim = () => document.body.classList.remove("no-anim");
  requestAnimationFrame(() => requestAnimationFrame(clearNoAnim));
  setTimeout(clearNoAnim, 50);
  setupMasterButton();

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
      e.preventDefault();
      const b = document.getElementById("collapseAllButton");
      if (b) b.click();
    }
  });

  function mkHeader(text, sid) {
    const h = document.createElement("div");
    h.className = "card-header";
    const p = document.createElement("p");
    p.className = "card-header-title";
    p.textContent = text;
    h.appendChild(p);
    if (sid) {
      const s = document.createElement("span");
      s.className = "card-header-summary";
      s.id = sid;
      h.appendChild(s);
    }
    return h;
  }

  function mkBtn() {
    const b = document.createElement("button");
    b.className = "card-collapse-btn";
    b.type = "button";
    b.setAttribute("aria-expanded", "true");
    b.setAttribute("aria-label", t('card.collapse'));
    const s = document.createElement("span");
    s.className = "card-collapse-caret";
    s.textContent = "▾";
    b.appendChild(s);
    return b;
  }

  function wrapAll(card, headerEl) {
    const body = document.createElement("div");
    body.className = "card-body";
    const inner = document.createElement("div");
    inner.className = "card-body-inner";
    while (card.firstChild) inner.appendChild(card.firstChild);
    body.appendChild(inner);
    card.appendChild(headerEl);
    card.appendChild(body);
  }

  function wrapAfter(card, headerEl) {
    const body = document.createElement("div");
    body.className = "card-body";
    const inner = document.createElement("div");
    inner.className = "card-body-inner";
    let node = headerEl.nextSibling;
    while (node) {
      const next = node.nextSibling;
      inner.appendChild(node);
      node = next;
    }
    body.appendChild(inner);
    card.appendChild(body);
  }
}

function toggleCard(card, forceExpanded) {
  const wasExpanded = !card.classList.contains("is-collapsed");
  const collapse = forceExpanded !== undefined ? !forceExpanded : wasExpanded;

  if (collapse) {
    const body = card.querySelector(".card-body");
    if (body) {
      if (body.contains(document.activeElement)) {
        const b = card.querySelector(".card-collapse-btn");
        if (b) b.focus();
      }
      body.style.height = "";
    }
  }

  card.classList.toggle("is-collapsed", collapse);
  const btn = card.querySelector(".card-collapse-btn");
  if (btn) {
    btn.setAttribute("aria-expanded", String(!collapse));
    btn.setAttribute("aria-label", collapse ? t('card.expand') : t('card.collapse'));
  }

  persistCardState(card.dataset.cardId, collapse);
  updateMasterButton();
}

function persistCardState(id, collapsed) {
  if (!id) return;
  try {
    const s = JSON.parse(localStorage.getItem("greenwashing-collapsed-cards-v1") || "{}");
    if (collapsed) s[id] = true;
    else delete s[id];
    localStorage.setItem("greenwashing-collapsed-cards-v1", JSON.stringify(s));
  } catch {}
}

function restoreStates(entries, storageKey) {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    stored = {};
  }
  entries.forEach(({ card, id, btn }) => {
    if (card.hidden) return;
    if (stored[id]) {
      card.classList.add("is-collapsed");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", t('card.expand'));
    }
  });
}

function setupMasterButton() {
  const mb = document.getElementById("collapseAllButton");
  if (!mb) return;
  mb.addEventListener("click", () => {
    const cards = Array.from(document.querySelectorAll(".card-collapsible"));
    const expanded = cards.filter((c) => !c.classList.contains("is-collapsed")).length;
    const doCollapse = expanded >= cards.length / 2;
    cards.forEach((c, i) =>
      setTimeout(() => toggleCard(c, !doCollapse), i * 20)
    );
    if (doCollapse) {
      setTimeout(
        () => window.scrollTo({ top: 0, behavior: "smooth" }),
        cards.length * 20 + 100
      );
    }
  });
  updateMasterButton();
}

function updateMasterButton() {
  const mb = document.getElementById("collapseAllButton");
  if (!mb) return;
  const all = document.querySelectorAll(".card-collapsible");
  let exp = 0;
  all.forEach((c) => {
    if (!c.classList.contains("is-collapsed")) exp++;
  });
  mb.textContent = exp >= all.length / 2 ? `⊟ ${t('btn.collapseAll')}` : `⊞ ${t('btn.expandAll')}`;
}

// Auto-expand a card by its data-card-id (used after analysis adds details)
function autoExpandCard(cardId) {
  const card = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!card) return;
  if (card.classList.contains("is-collapsed")) {
    toggleCard(card, true);
  }
}

// Compatibility shim: resetAllCollapsibles is called by clearButton.
// Now it collapses the 3 detail cards (emotion/llm/verification) and resets their summaries.
function resetAllCollapsibles() {
  ["emotion", "llm", "verification"].forEach((cardId) => {
    const card = document.querySelector(`[data-card-id="${cardId}"]`);
    if (card && !card.classList.contains("is-collapsed")) {
      toggleCard(card, false);
    }
  });
  const emotionSummary = document.getElementById("emotionCollapsibleSummary");
  const llmSummary = document.getElementById("llmCollapsibleSummary");
  const verificationSummary = document.getElementById("verificationCollapsibleSummary");
  if (emotionSummary) emotionSummary.textContent = t('emotion.summaryPending');
  if (llmSummary) llmSummary.textContent = t('llm.noConfig');
  if (verificationSummary) verificationSummary.textContent = t('verification.statusPending');
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  analyzeText();
});

sampleButton.addEventListener("click", () => {
  resetClassificationControls({ resetSelects: true });
  textArea.value = sampleText;
  updatePdfUploadVisibility();
  classifyCurrentText({ force: true, reason: "sample" });
  form.requestSubmit();
});

const welcomeTryButton = document.getElementById("welcomeTryButton");
if (welcomeTryButton) {
  welcomeTryButton.addEventListener("click", () => {
    resetClassificationControls({ resetSelects: true });
    textArea.value = sampleText;
    updatePdfUploadVisibility();
    classifyCurrentText({ force: true, reason: "sample" });
    form.requestSubmit();
  });
}

clearButton.addEventListener("click", () => {
  textArea.value = "";
  latestAnalysis = null;
  currentDocument = null;
  resetClassificationControls({ resetSelects: true });
  setClassificationStatus(t('classification.autoHint'));
  exportButton.disabled = true;
  if (typeof CSS !== "undefined" && CSS.highlights) CSS.highlights.clear();
  if (docViewer) docViewer.hidden = true;
  if (docViewerBody) docViewerBody.innerHTML = "";
  document.querySelector(".result-panel").classList.remove("analyzing");
  showWelcome();
  renderResult(createEmptyResult());
  renderLlm(null, null);
  renderLlmDetails(null);
  renderVerification(null);
  renderProgress({
    status: "idle",
    stage: "idle",
    progress: 0,
    message: t('progress.idle'),
  });
  resetAllCollapsibles();
  updatePdfUploadVisibility();
  textArea.focus();
});

exportButton.addEventListener("click", exportLatestAnalysis);
clearHistoryButton.addEventListener("click", () => {
  if (confirm(t('history.clearConfirm'))) {
    clearHistory();
  }
});
historySummaryButton.addEventListener("click", summarizeHistoryTrends);
copyRewriteButton.addEventListener("click", async () => {
  if (!rewriteContent.textContent) return;
  try {
    await navigator.clipboard.writeText(rewriteContent.textContent);
    copyRewriteButton.textContent = t('btn.copied');
    setTimeout(() => {
      copyRewriteButton.textContent = t('btn.copyRewrite');
    }, 1600);
  } catch {}
});

renderResult(createEmptyResult());
renderLlm(null, null);
renderLlmDetails(null);
renderVerification(null);
renderProgress({
  status: "idle",
  stage: "idle",
  progress: 0,
  message: t('progress.idle'),
});
exportButton.disabled = true;
setupResultTabs();
setupCardCollapse();
setupSettingsDrawer();
setupDeepAnalyze();
updatePdfUploadVisibility();
loadHealth();
loadHistory();
registerServiceWorker();
setupPdfUpload();
setupThemeToggle();
setupLangToggle();
if (window.i18n) window.i18n.applyStaticI18n();
