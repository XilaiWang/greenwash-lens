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
// 当 /analyze-jobs 端点失败时切换到同步 /analyze 路径作为降级
let preferLegacyAnalyze = false;
let llmAvailable = false;
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

async function analyzeText() {
  const text = textArea.value.trim();

  if (!text) {
    latestAnalysis = null;
    exportButton.disabled = true;
    clearTimeout(classifyTimer);
    lastClassifiedText = "";
    setClassificationStatus("添加内容后自动判断场景和行业");
    renderResult(createEmptyResult());
    renderLlm(null, null);
    renderLlmDetails(null);
    renderVerification(null);
    renderProgress({
      status: "idle",
      stage: "idle",
      progress: 0,
      message: "输入文本后开始分析。",
    });
    textArea.focus();
    return;
  }

  currentJobId = null;
  currentJobStartedAt = Date.now();
  latestAnalysis = null;
  exportButton.disabled = true;
  setBusy(true);
  renderProgress({
    status: "creating",
    stage: "creating",
    progress: 4,
    message: "正在创建分析任务。",
  });
  renderVerification(null);

  try {
    const requestPayload = buildAnalysisRequestPayload(text);

    if (preferLegacyAnalyze) {
      await runLegacyAnalysis(requestPayload);
      return;
    }

    const response = await apiFetch(apiUrl("/api/v1/analyze-jobs"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });
    const job = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = job?.error || "分析任务创建失败";

      if (response.status === 404 || /接口不存在|not found/i.test(errorMessage)) {
        preferLegacyAnalyze = true;
        await runLegacyAnalysis(requestPayload);
        return;
      }

      throw new Error(errorMessage);
    }

    currentJobId = job.id;
    renderProgress(job);
    await pollJob(job.id, requestPayload);
  } catch (error) {
    if (localEngine) {
      await runLocalAnalysis(requestPayload, error.message || "后端不可用");
    } else {
      failAnalysis(error.message || "分析失败");
    }
  } finally {
    setBusy(false);
  }
}

async function pollJob(jobId, requestPayload) {
  let notFoundCount = 0;

  while (true) {
    if (Date.now() - currentJobStartedAt > JOB_TIMEOUT_MS) {
      throw new Error("分析耗时过长，已停止等待。你可以稍后重试，或先关闭外部模型增强。");
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
            message: "任务状态丢失，已切换到直连模式",
          });
          await runLegacyAnalysis(requestPayload);
          return;
        }

        await sleep(JOB_POLL_INTERVAL_MS);
        continue;
      }

      throw new Error(job.error || "分析任务读取失败");
    }

    notFoundCount = 0;

    renderProgress(job);
    renderJobSnapshot(job);

    if (job.status === "completed") {
      latestAnalysis = job.result;
      exportButton.disabled = false;
      engineStatus.textContent = `应用已连接 · ${job.result.meta.engineVersion}`;
      applyHighlights(job.result?.result?.signals || []);
      loadHistory();
      return;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "分析任务失败");
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
  engineStatus.textContent = "应用未连接";
  renderResult({
    ...createEmptyResult(),
    level: "连接异常",
    summary: detail,
    factors: ["后端分析接口没有返回有效结果。"],
    signals: [fileModeHint()],
  });
  renderLlm(
    {
      enabled: false,
      provider: "none",
      model: null,
      summary: "当前没有拿到可用的外部模型补充结果。",
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
        title: "分析任务失败",
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
      throw new Error(payload.error || "历史记录读取失败");
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
  if (subtitle) subtitle.textContent = `最近 ${scores.length} 次分析`;

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
    empty.textContent = "暂无历史记录";
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
    deleteButton.setAttribute("aria-label", "删除这条历史记录");
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
    setClassificationStatus("添加内容后自动判断场景和行业");
    return;
  }

  if (isManualClassificationField("context") && isManualClassificationField("sector")) {
    setClassificationStatus("使用当前手动选择的场景和行业");
    return;
  }

  setClassificationStatus("输入停止后自动识别场景和行业", "loading");
  classifyTimer = setTimeout(() => {
    classifyCurrentText({ reason: "typing" });
  }, 1200);
}

async function classifyCurrentText({ force = false, reason = "text" } = {}) {
  const text = textArea.value.trim();

  if (!text || text.length < 20) {
    setClassificationStatus("添加内容后自动判断场景和行业");
    return null;
  }

  if (!force && text === lastClassifiedText) {
    return null;
  }

  const requestPayload = buildAnalysisRequestPayload(text);

  if (!force && requestPayload.contextType !== "auto" && requestPayload.sector !== "auto") {
    setClassificationStatus("使用当前手动选择的场景和行业");
    return null;
  }

  const requestId = ++classificationRequestId;
  lastClassifiedText = text;
  setClassificationStatus(
    reason === "pdf" ? "PDF 已提取，正在用 AI 识别场景和行业..." : "正在用 AI 识别场景和行业...",
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
      throw new Error(payload?.error || "自动识别失败");
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
    const methodLabel = payload.method === "llm" ? "AI" : "本地";
    setClassificationStatus(`${methodLabel}已识别：${contextLabel} · ${sectorLabel}`, "success");
    renderClassification(classification);
    return classification;
  } catch (error) {
    if (requestId === classificationRequestId) {
      setClassificationStatus(error.message || "自动识别暂不可用，将在分析时识别", "error");
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
    message: "已加载历史结果。",
  });
}

async function clearHistory() {
  try {
    const response = await apiFetch(apiUrl("/api/history"), { method: "DELETE" });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || "清空失败");
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
      throw new Error(payload?.error || "删除失败");
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

function renderEmotionAnalysis(emotion) {
  if (!emotionPanel || !emotionScore || !emotionLevel) return;

  const breakdown = emotion?.breakdown || {};
  const finalScore = Math.round(Number(emotion?.finalScore || 0));
  const level = emotion?.level || "none";
  const consistency = Math.round(Number(emotion?.consistency || 0));
  const layersUsed = Number(emotion?.layersUsed || 0);
  const levelLabelMap = {
    none: "无明显风险",
    low: "低",
    medium: "中",
    high: "高",
  };
  const plainExplainMap = {
    none: "未检测到明显的情感操控倾向，文本语气较为中性客观。",
    low: "文本带有轻微的正面情感色彩，属于正常的品牌表达范畴。",
    medium: "文本存在一定的情感诉求策略，可能试图通过情绪引导影响判断，建议结合具体措辞复核。",
    high: "文本情感操控倾向显著，大量使用高度情绪化的表达，可能存在误导性渲染。",
  };

  emotionPanel.dataset.level = level;
  emotionScore.textContent = layersUsed ? String(finalScore) : "--";
  emotionLevel.textContent = layersUsed ? levelLabelMap[level] || "待分析" : "待分析";
  emotionWarning.hidden = consistency >= 60 || layersUsed < 2;

  const plainExplain = document.getElementById("emotionPlainExplain");
  if (plainExplain) {
    plainExplain.textContent = layersUsed
      ? (plainExplainMap[level] || plainExplainMap.none)
      : "分析完成后，这里会用通俗语言解释文本的情绪倾向。";
  }

  updateEmotionBar(emotionRuleBar, emotionRuleValue, breakdown.rule, "0");
  updateEmotionBar(emotionNlpBar, emotionNlpValue, breakdown.nlp, "--");
  updateEmotionBar(emotionLlmBar, emotionLlmValue, breakdown.llm, "0");

  emotionConsistency.textContent =
    layersUsed >= 2 ? `一致性：${consistency}%` : layersUsed === 1 ? "一致性：待计算" : "一致性：待分析";
  emotionLayers.textContent = layersUsed ? `使用层数：${layersUsed}` : "使用层数：待分析";
  renderEmotionNlpDetail(emotion?.nlpDetail || null, {
    nlpAvailable: breakdown.nlp !== null,
    layersUsed,
  });

  const summary = document.getElementById("emotionCollapsibleSummary");
  if (summary) {
    if (!layersUsed) {
      summary.textContent = "待分析";
    } else if (level === "high") {
      summary.textContent = `情绪风险高 · ${finalScore}分 · 建议复核`;
    } else if (level === "medium") {
      summary.textContent = `情绪风险中 · ${finalScore}分`;
    } else {
      summary.textContent = `情绪风险低 · ${finalScore}分`;
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
    tag.textContent = nlpServiceAvailable ? "NLP 层本轮未参与" : "NLP 服务离线";
    emotionNlpDetail.append(tag);
    return;
  }

  emotionNlpDetail.hidden = !detail;
  if (!detail) return;

  const items = [
    `ClimateBERT：${detail.climateSentiment || "unknown"}`,
    `置信度：${percent((detail.sentimentConfidence || 0) * 100)}`,
    `承诺类型：${detail.commitmentType || "unknown"}`,
    `具体性：${percent((detail.specificityScore ?? 0) * 100)}`,
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
    llmSummary.textContent = "未配置外部模型 API，当前使用本地规则引擎。";
    renderList(llmAnnotations, ["暂无外部模型补充结果"]);
    if (summary) summary.textContent = "未配置外部模型";
    return;
  }

  if (llm.error) {
    llmSummary.textContent = `${provider} 调用失败：${llm.error}`;
    renderList(llmAnnotations, ["本地规则引擎结果仍然可用。"]);
    if (summary) summary.textContent = `${provider} 调用失败`;
    return;
  }

  llmSummary.textContent = llm.enabled
    ? `${provider} · ${llm.model}：${llm.summary}`
    : `外部模型未启用：${llm.summary}`;
  renderList(
    llmAnnotations,
    llm.annotations && llm.annotations.length ? llm.annotations : ["暂无外部模型补充结果"],
  );

  if (summary) {
    summary.textContent = llm.enabled
      ? `${provider} · ${llm.model}`
      : "外部模型未启用";
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
    verificationSummary.textContent = "分析完成后会显示自动识别和外部模型的自我校验结果。";
    renderList(verificationChecks, ["暂无校验结果"]);
    verificationChecks.dataset.overall = "idle";
    if (summary) summary.textContent = "待分析";
    return;
  }

  const summaryMap = {
    pass: "本次分析的自动识别和外部模型结果整体可采信。",
    warn: "本次分析存在需要人工留意的环节，建议结合原文复核。",
    fail: "本次分析出现明显异常，建议先不要直接采信结果。",
  };

  verificationSummary.textContent = summaryMap[verification.overall] || "已完成校验。";
  verificationChecks.dataset.overall = verification.overall;
  renderList(
    verificationChecks,
    verification.checks.map((check) => `${verificationStatusLabel(check.status)} ${check.title}：${check.message}`),
  );

  const overallLabel = { pass: "通过", warn: "提示", fail: "异常" };
  if (summary) {
    summary.textContent = `${overallLabel[verification.overall] || "已完成"} · ${verification.checks.length}项校验`;
  }
  autoExpandCard("verification");
}

function renderProgress(job) {
  if (!progressPanel || !progressLabel || !progressMessage || !progressFill) return;

  const status = job.stalled ? "stalled" : job.status;
  const labelMap = {
    idle: "待开始",
    creating: "创建任务",
    queued: "排队中",
    running: "分析中",
    completed: "已完成",
    failed: "失败",
    stalled: "耗时偏长",
  };

  progressPanel.dataset.status = status;
  progressLabel.textContent = labelMap[status] || "分析中";
  if (progressStageText) {
    progressStageText.textContent = stageLabel(job.stage);
  }
  progressMessage.textContent = job.stalled
    ? `${job.message} 当前环节耗时偏长，可能卡在外部模型或网络。`
    : job.message;
  if (progressTiming) {
    const elapsedMs = Number(job.elapsedMs || 0);
    progressTiming.textContent = elapsedMs ? formatElapsed(elapsedMs) : "0 秒";
  }
  progressFill.style.width = `${clamp(job.progress || 0)}%`;
  engineStatus.textContent =
    status === "completed"
      ? engineStatus.textContent
      : `分析状态 · ${stageLabel(job.stage)} · ${Math.round(job.progress || 0)}%`;
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
      throw new Error(payload?.error || "同步分析接口调用失败");
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
      message: "分析完成。当前服务使用同步分析接口返回结果。",
    });
    engineStatus.textContent = `应用已连接 · ${normalized.meta?.engineVersion || "legacy-api"}`;
    applyHighlights(normalized.result?.signals || []);
    loadHistory();
  } catch (error) {
    if (localEngine) {
      await runLocalAnalysis(requestPayload, error.message || "同步分析接口不可用");
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
      ? "后端暂不可用，已切换到浏览器本地分析。"
      : "正在执行浏览器本地分析。",
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
    message: "分析完成。当前显示的是浏览器本地分析结果。",
  });
  engineStatus.textContent = `离线可用 · ${payload.meta.engineVersion}`;
  applyHighlights(payload.result?.signals || []);
  renderHistory(localEngine.loadHistory());
}

function startLegacyProgressTicker() {
  const stages = [
    {
      after: 0,
      stage: "classifying",
      progress: 14,
      message: "正在识别语言、文本场景和行业。",
    },
    {
      after: 900,
      stage: "rule_engine",
      progress: 32,
      message: "正在运行本地规则引擎。",
    },
    {
      after: 2000,
      stage: "llm_enrichment",
      progress: 58,
      message: "正在请求外部模型补充判断。",
    },
    {
      after: 6000,
      stage: "verification",
      progress: 76,
      message: "正在整理结果并进行自检。",
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
      <span>语言：待识别</span>
      <span>场景：待识别</span>
      <span>行业：待识别</span>
    `;
    return;
  }

  const sourceLabel = (source) => {
    if (source === "llm") return "AI";
    if (source === "manual") return "手动";
    return "关键词";
  };

  const contextSource = sourceLabel(classification.context.source);
  const sectorSource = sourceLabel(classification.sector.source);

  classificationStrip.innerHTML = `
    <span>语言：${classification.language.label}</span>
    <span>场景：${classification.context.label} · ${contextSource}</span>
    <span>行业：${classification.sector.label} · ${sectorSource}</span>
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
  submitButton.textContent = isBusy ? "分析中" : "开始分析";
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
    engineStatus.textContent = `应用已连接 · ${payload.engineVersion}`;
    if (payload.storage?.historyEnabled === false) {
      engineStatus.textContent += " · 历史已关闭";
    }
    updateHistorySummaryButton();
  } catch {
    if (localEngine) {
      const payload = localEngine.health();
      llmAvailable = Boolean(payload.llmService?.enabled);
      nlpServiceAvailable = Boolean(payload.nlpService?.available);
      engineStatus.textContent = `离线可用 · ${payload.engineVersion}`;
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
  historySummaryButton.title = llmAvailable ? "" : "需要配置外部模型 API";
  updateDeepAnalyzeButton();
}

async function summarizeHistoryTrends() {
  if (!llmAvailable) return;

  try {
    historySummary.hidden = false;
    historySummary.textContent = "正在生成趋势分析...";
    const response = await apiFetch(apiUrl("/api/v1/history/summary"), {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || "趋势分析失败");
    }

    if (!payload?.summary) {
      historySummary.textContent = "当前没有可用的趋势总结结果。";
      return;
    }

    historySummary.textContent = payload.summary;
  } catch (error) {
    historySummary.hidden = false;
    historySummary.textContent = error.message || "趋势分析失败。";
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
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes} 分 ${seconds} 秒`;
}

function labelForContext(value) {
  const labels = {
    auto: "智能识别",
    marketing: "营销文案",
    product: "产品描述",
    report: "ESG/CSR 报告",
    social: "社媒内容",
    press_release: "新闻稿/公关",
    investor_relations: "投资者关系",
    policy: "政策/法规",
    employer_branding: "雇主品牌",
  };
  return labels[value] || "通用场景";
}

function labelForSector(value) {
  const labels = {
    auto: "智能识别",
    general: "通用",
    energy: "能源/化工",
    fashion: "服装/零售",
    aviation: "航空/物流",
    manufacturing: "制造业",
    finance: "金融",
    technology: "科技",
    food_agriculture: "食品/农业",
    construction_realestate: "建筑/房地产",
    automotive: "汽车/交通",
    consumer_goods: "消费品/日化",
    healthcare: "医药/健康",
  };
  return labels[value] || "通用";
}

function verificationStatusLabel(status) {
  if (status === "pass") return "通过";
  if (status === "warn") return "提示";
  return "异常";
}

function stageLabel(stage) {
  const labels = {
    idle: "待开始",
    creating: "创建任务",
    queued: "排队中",
    classifying: "自动识别",
    scoring: "本地规则评分",
    "nlp-local": "NLP 情绪模型",
    "nlp-skip": "跳过 NLP",
    llm: "外部模型增强",
    rule_engine: "本地规则评分",
    rule_preview: "本地结果预览",
    llm_enrichment: "外部模型增强",
    verification: "自我校验",
    saving: "保存记录",
    fallback: "切换直连模式",
    completed: "分析完成",
    failed: "分析失败",
  };

  return labels[stage] || "分析中";
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
    return `当前页面是文件模式，正在尝试连接本地服务 ${apiBase}`;
  }

  return "如果卡住太久，建议先检查应用服务和外部模型服务状态。";
}

function buildUnavailableMessage() {
  if (window.location.protocol === "file:") {
    return `当前页面是通过文件方式打开的，必须先启动本地应用服务，然后连接到 ${apiBase} 才能调用分析接口。`;
  }

  return "当前应用服务不可用，请确认应用已启动。";
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
    checks.push(buildClientClassificationCheck("文本场景识别", classification.context));
  }

  if (classification?.sector) {
    checks.push(buildClientClassificationCheck("行业识别", classification.sector));
  }

  if (result) {
    checks.push(
      result.confidence < 55
        ? {
            id: "rule_confidence_low",
            status: "warn",
            title: "本地规则置信度",
            message: "本地规则对当前文本的把握一般，建议结合原文复核。",
          }
        : {
            id: "rule_confidence_ok",
            status: "pass",
            title: "本地规则置信度",
            message: `本地规则引擎置信度为 ${Math.round(result.confidence)}%。`,
          },
    );
  }

  if (!llm || !llm.enabled) {
    checks.push({
      id: "llm_disabled",
      status: "warn",
      title: "外部模型增强",
      message: llm?.error
        ? `外部模型本轮未正常返回：${llm.error}`
        : "当前结果没有拿到外部模型增强，主要依据本地规则生成。",
    });
  } else {
    checks.push({
      id: "llm_enabled",
      status: "pass",
      title: "外部模型增强",
      message: `已启用 ${llm.provider} · ${llm.model}。`,
    });

    if (Number.isFinite(llm.adjustedRisk) && result) {
      const gap = Math.abs(llm.adjustedRisk - result.risk);
      checks.push({
        id: "llm_gap",
        status: gap > 25 ? "warn" : "pass",
        title: "外部模型一致性",
        message:
          gap > 25
            ? `外部模型与本地规则分差较大（${gap} 分），建议人工复核。`
            : `外部模型与本地规则分差可接受（${gap} 分）。`,
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
    return `当前文本的绿色声明概率只有 ${Math.round(result.claimProb)}%，低于 ${result.claimThreshold || 42}% 的识别阈值，所以系统返回的是基线低风险分 ${Math.round(result.risk)}%，不是完整 greenwashing 高风险判断。`;
  }

  if (result.decisionMode === "green-claim-risk") {
    return `当前文本已被识别为绿色声明，系统进入完整风险评分流程，再结合证据、模糊表达、承诺落差和外部模型结果给出最终分数。`;
  }

  return "分析完成后会显示这次分数是完整风险判断，还是非绿色声明基线分。";
}

function buildClientClassificationCheck(title, part) {
  const confidence = part?.detected?.confidence ?? 0;

  if (part?.source === "manual") {
    return {
      id: `${title}-manual`,
      status: "pass",
      title,
      message: "当前结果使用了人工覆盖，不依赖自动识别。",
    };
  }

  if (confidence < 0.55) {
    return {
      id: `${title}-low`,
      status: "warn",
      title,
      message: `自动识别置信度偏低（${Math.round(confidence * 100)}%），建议人工复核。`,
    };
  }

  return {
    id: `${title}-ok`,
    status: "pass",
    title,
    message: `自动识别置信度正常（${Math.round(confidence * 100)}%）。`,
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
    setPdfUploadState("error", "请上传 PDF 格式的文件。");
    setTimeout(() => setPdfUploadState("idle"), 3000);
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    setPdfUploadState("error", "文件过大，请上传 20MB 以内的 PDF。");
    setTimeout(() => setPdfUploadState("idle"), 3000);
    return;
  }

  setPdfUploadState("processing", "正在提取文字...");

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
      throw new Error(data?.error || "PDF 文字提取失败");
    }

    resetClassificationControls({ resetSelects: true });
    textArea.value = data.text;
    updatePdfUploadVisibility();
    renderDocument(data.document || null);
    const engineLabel = data.engine === "poppler" ? "系统引擎" : "JS 引擎";
    const warnings = data.warnings || [];
    let statusMsg = `已提取 ${data.text.length} 个字符 · ${engineLabel}`;
    if (warnings.length) {
      statusMsg += " · 已优化长文档";
    }
    statusMsg += ` · ${file.name}`;
    setPdfUploadState("success", statusMsg);
    await classifyCurrentText({ force: true, reason: "pdf" });
    setTimeout(() => setPdfUploadState("idle"), warnings.length ? 8000 : 5000);
  } catch (error) {
    setPdfUploadState("error", error.message || "提取失败，请重试。");
    setTimeout(() => setPdfUploadState("idle"), 5000);
  }
}

let currentDocument = null;

function renderDocument(doc) {
  if (!docViewer || !docViewerBody) return;
  currentDocument = doc;

  if (!doc || !doc.length) {
    docViewer.hidden = true;
    workspace?.classList.remove("has-document");
    return;
  }

  docViewer.hidden = false;
  workspace?.classList.add("has-document");
  docViewerBody.innerHTML = "";

  doc.forEach((block) => {
    if (block.type === "paragraph") {
      const p = document.createElement("p");
      p.className = "doc-para";
      p.textContent = block.text;
      docViewerBody.append(p);
    } else if (block.type === "table") {
      const wrapper = document.createElement("div");
      wrapper.className = "doc-table";
      const label = document.createElement("span");
      label.className = "doc-table-label";
      label.textContent = "表格内容";
      wrapper.append(label);
      const pre = document.createElement("pre");
      pre.style.cssText = "margin:0;white-space:pre;font:inherit;";
      pre.textContent = block.rows.join("\n");
      wrapper.append(pre);
      docViewerBody.append(wrapper);
    }
  });
}

function applyHighlights(signals) {
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
        signalMap.set(term, "green-signal");
      } else if (prefix.includes("模糊")) {
        signalMap.set(term, "vague-signal");
      } else if (prefix.includes("断言") || prefix.includes("absolute")) {
        signalMap.set(term, "absolute-signal");
      } else if (prefix.includes("承诺") || prefix.includes("future")) {
        signalMap.set(term, "future-signal");
      }
    });
  }

  if (!signalMap.size) return;

  const walker = document.createTreeWalker(docViewerBody, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const text = node.textContent;
    const matches = [];

    signalMap.forEach((cssClass, term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, cssClass });
      }
    });

    if (!matches.length) return;

    matches.sort((a, b) => a.start - b.start);

    const merged = [];
    for (const m of matches) {
      const last = merged[merged.length - 1];
      if (last && last.end >= m.start) {
        last.end = Math.max(last.end, m.end);
        if (!last.classes) last.classes = [last.cssClass];
        if (!last.classes.includes(m.cssClass)) last.classes.push(m.cssClass);
      } else {
        merged.push({ start: m.start, end: m.end, cssClass: m.cssClass });
      }
    }

    const fragment = document.createDocumentFragment();
    let pos = 0;
    for (const m of merged) {
      if (m.start > pos) {
        fragment.appendChild(document.createTextNode(text.slice(pos, m.start)));
      }
      const mark = document.createElement("mark");
      mark.className = m.classes ? m.classes.join(" ") : m.cssClass;
      mark.textContent = text.slice(m.start, m.end);
      fragment.appendChild(mark);
      pos = m.end;
    }
    if (pos < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(pos)));
    }

    node.parentNode.replaceChild(fragment, node);
  });
}

docViewerClose.addEventListener("click", () => {
  if (docViewer) docViewer.hidden = true;
  currentDocument = null;
  workspace?.classList.remove("has-document");
  if (docViewerBody) docViewerBody.innerHTML = "";
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
    setClassificationStatus("使用当前手动选择的场景和行业");
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

// ── Evidence Panel (ESG report self-verification) ──

let _evidenceFile = null;
let _evidencePollTimer = null;

function setEvidenceProgress(pct, label, msg) {
  const wrap = document.getElementById("evidenceProgress");
  const fill = document.getElementById("evidenceProgressFill");
  const lblEl = document.getElementById("evidenceProgressLabel");
  const pctEl = document.getElementById("evidenceProgressPct");
  const msgEl = document.getElementById("evidenceProgressMsg");
  if (wrap) wrap.hidden = false;
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (lblEl && label) lblEl.textContent = label;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (msgEl && msg !== undefined) msgEl.textContent = msg;
}

function clearEvidenceProgress() {
  const wrap = document.getElementById("evidenceProgress");
  if (wrap) wrap.hidden = true;
}

async function updateEvidenceBadge() {
  const badge = document.getElementById("evidenceStatusBadge");
  const btn = document.getElementById("evidenceStartButton");
  if (!badge) return;
  try {
    const resp = await apiFetch(apiUrl("/api/health"));
    const payload = await resp.json();
    const avail = !!payload.evidenceEngine?.available;
    if (avail) {
      badge.textContent = "引擎可用";
      badge.classList.add("is-available");
      if (btn) btn.disabled = !_evidenceFile;
    } else {
      badge.textContent = "引擎未启动";
      badge.classList.remove("is-available");
      if (btn) {
        btn.disabled = true;
        btn.title = "证据核验引擎未启动。请确认 GEMINI_API_KEY 已配置且 Python sidecar 在运行。";
      }
    }
  } catch {
    badge.textContent = "引擎未启动";
    badge.classList.remove("is-available");
    if (btn) btn.disabled = true;
  }
}

function setupEvidenceUpload() {
  const zone = document.getElementById("evidenceUploadZone");
  const input = document.getElementById("evidencePdfInput");
  const btn = document.getElementById("evidenceStartButton");
  if (!zone || !input) return;

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("仅支持 PDF 文件");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert("文件超过 50MB 上限");
      return;
    }
    _evidenceFile = file;
    const label = zone.querySelector(".evidence-upload-label");
    if (label) label.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    if (btn) btn.disabled = false;
  }

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => handleFile(input.files[0]));
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    handleFile(e.dataTransfer.files[0]);
  });

  btn?.addEventListener("click", runEvidenceVerification);
}

async function runEvidenceVerification() {
  if (!_evidenceFile) return;
  const btn = document.getElementById("evidenceStartButton");
  if (btn) btn.disabled = true;
  document.getElementById("evidenceResult").hidden = true;
  setEvidenceProgress(5, "上传中", "正在上传 PDF...");

  const company = document.getElementById("evidenceCompany").value.trim() || "unknown";
  const year = document.getElementById("evidenceYear").value || 2024;

  const fd = new FormData();
  fd.append("file", _evidenceFile);
  fd.append("company", company);
  fd.append("year", year);
  fd.append("report_type", "esg_report");
  fd.append("language", "zh");

  let analysisId;
  try {
    const resp = await fetch(apiUrl("/evidence/upload"), { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
    analysisId = data.analysis_id;
  } catch (err) {
    setEvidenceProgress(0, "上传失败", err.message);
    if (btn) btn.disabled = false;
    return;
  }

  setEvidenceProgress(15, "索引中", "PDF 已上传，正在建立索引...");

  // Poll status
  if (_evidencePollTimer) clearInterval(_evidencePollTimer);
  _evidencePollTimer = setInterval(async () => {
    try {
      const resp = await fetch(apiUrl(`/evidence/status/${analysisId}`));
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      const status = data.status || "";
      const progress = data.progress || 0;
      const stageLabel = {
        uploading: "上传中",
        indexing: "索引中",
        extracting: "提取声明",
        verifying: "证据核验",
        completed: "完成",
        failed: "失败",
      }[status] || status;
      setEvidenceProgress(progress, stageLabel,
        data.claims_found ? `已识别 ${data.claims_found} 条声明${data.verdicts_complete !== undefined ? `，已核验 ${data.verdicts_complete}` : ""}` : "");
      if (status === "completed") {
        clearInterval(_evidencePollTimer);
        _evidencePollTimer = null;
        await loadEvidenceReport(analysisId);
        if (btn) btn.disabled = false;
      } else if (status === "failed") {
        clearInterval(_evidencePollTimer);
        _evidencePollTimer = null;
        setEvidenceProgress(progress, "失败", data.error || "未知错误");
        if (btn) btn.disabled = false;
      }
    } catch (err) {
      // Ignore intermittent polling errors
    }
  }, 2000);
}

async function loadEvidenceReport(analysisId) {
  try {
    const resp = await fetch(apiUrl(`/evidence/report/${analysisId}`));
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    renderEvidenceReport(data);
    setEvidenceProgress(100, "完成", "证据核验已完成");
  } catch (err) {
    setEvidenceProgress(100, "失败", `加载报告失败: ${err.message}`);
  }
}

function renderEvidenceReport(data) {
  const result = document.getElementById("evidenceResult");
  if (!result) return;
  result.hidden = false;

  // Scores (support both nested and flat key shapes)
  const textRisk = data.text_risk ?? data.scores?.text_risk ?? 0;
  const evRisk = data.evidence_risk ?? data.scores?.evidence_risk ?? 0;
  const gri = data.gri ?? data.scores?.gri ?? data.GRI ?? 0;
  const setScore = (idLabel, idValue, label, n) => {
    const v = document.getElementById(idValue);
    const l = document.getElementById(idLabel);
    if (v) v.textContent = Math.round(n);
    if (l) l.textContent = label;
  };
  const riskLabel = (n) => n < 30 ? "低" : n < 60 ? "中" : n < 80 ? "较高" : "高";
  setScore("evidenceTextRiskLabel", "evidenceTextRisk", riskLabel(textRisk), textRisk);
  setScore("evidenceEvidenceRiskLabel", "evidenceEvidenceRisk", riskLabel(evRisk), evRisk);
  setScore("evidenceGRILabel", "evidenceGRI", riskLabel(gri), gri);

  // Verdict distribution
  const dist = data.verdict_distribution || data.distribution || {};
  document.getElementById("evSupported").textContent = `✅ 支持: ${dist.supported || 0}`;
  document.getElementById("evPartial").textContent = `⚠️ 部分支持: ${dist.partial || dist.partially_supported || 0}`;
  document.getElementById("evContradicted").textContent = `❌ 矛盾: ${dist.contradicted || 0}`;
  document.getElementById("evInsufficient").textContent = `❓ 证据不足: ${dist.insufficient || 0}`;

  // Findings
  const findingsList = document.getElementById("evidenceFindingsList");
  findingsList.innerHTML = "";
  (data.key_findings || data.findings || []).forEach((f) => {
    const li = document.createElement("li");
    li.textContent = typeof f === "string" ? f : (f.text || JSON.stringify(f));
    findingsList.appendChild(li);
  });
  if (!findingsList.children.length) {
    const li = document.createElement("li");
    li.textContent = "暂无关键发现";
    findingsList.appendChild(li);
  }

  // Claims
  const claims = data.claims || [];
  document.getElementById("evidenceClaimsCount").textContent = claims.length;
  const claimsList = document.getElementById("evidenceClaimsList");
  claimsList.innerHTML = "";
  claims.forEach((c) => {
    const verdict = c.verdict || c.label || "insufficient";
    const verdictMap = {
      supported: { cls: "supported", label: "✅ 支持" },
      partially_supported: { cls: "partial", label: "⚠️ 部分支持" },
      partial: { cls: "partial", label: "⚠️ 部分支持" },
      contradicted: { cls: "contradicted", label: "❌ 矛盾" },
      insufficient: { cls: "insufficient", label: "❓ 证据不足" },
    };
    const v = verdictMap[verdict] || verdictMap.insufficient;
    const card = document.createElement("div");
    card.className = "evidence-claim-card";
    const head = document.createElement("div");
    const tag = document.createElement("span");
    tag.className = `evidence-claim-verdict ${v.cls}`;
    tag.textContent = v.label;
    head.appendChild(tag);
    card.appendChild(head);
    const textP = document.createElement("p");
    textP.style.margin = "0";
    textP.textContent = c.claim || c.text || "";
    card.appendChild(textP);
    if (c.reasoning || c.evidence_text) {
      const reason = document.createElement("p");
      reason.style.margin = "0";
      reason.style.color = "var(--muted)";
      reason.style.fontSize = "11px";
      reason.textContent = c.reasoning || c.evidence_text;
      card.appendChild(reason);
    }
    claimsList.appendChild(card);
  });
}

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
    btn.title = "需配置外部模型后启用";
  } else if (!hasResult) {
    btn.title = "请先运行基础分析";
  } else {
    btn.title = "运行 M3/M4/M5 深度分析";
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
      if (reason) reason.textContent = `深度分析失败: ${err.message}`;
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
      : "未启用外部模型";
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
    const vw = (m.vague_words_found || []).slice(0, 4).join("、") || "无";
    return `模糊词比 ${ratio} · 命中：${vw}`;
  });
  renderModule("M4", modules.M4_promotional_framing, (m) => {
    const ps = (m.positive_signals || []).length;
    const bs = (m.balance_signals || []).length;
    return `正向信号 ${ps} 个 · 平衡信号 ${bs} 个`;
  });
  renderModule("M5", modules.M5_commitment_action, (m) => {
    const avg = m.average_level != null ? m.average_level.toFixed(1) : "—";
    const worst = m.worst_level != null ? m.worst_level : "—";
    return `平均等级 ${avg} · 最低 ${worst} · L1 占比 ${Math.round((m.level1_share || 0) * 100)}%`;
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
        tagSpec.textContent = `具体度：${c.specificity}`;
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
      empty.textContent = "未识别出可分析的声明";
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
      li.textContent = "暂无";
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
      li.textContent = "暂无";
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
    // populate each provider group
    for (const p of PROVIDER_KEYS) {
      const info = data.providers?.[p] || { configured: false, model: "" };
      const cap = p.charAt(0).toUpperCase() + p.slice(1);
      const statusEl = document.getElementById(`settingsStatus${cap}`);
      const keyEl = document.getElementById(`settings${cap}Key`);
      const modelEl = document.getElementById(`settings${cap}Model`);
      if (statusEl) {
        statusEl.textContent = info.configured ? "已配置" : "未配置";
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
      msg.textContent = `加载设置失败: ${err.message}`;
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
  if (msg) { msg.textContent = "保存中..."; msg.setAttribute("data-status", "info"); }
  if (saveBtn) saveBtn.disabled = true;

  // Build updates payload
  const provider = document.querySelector('input[name="settingsProvider"]:checked')?.value || "none";
  const payload = { provider, providers: {} };
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
      if (msg) { msg.textContent = "✓ 已保存 — 未使用外部 Provider"; msg.setAttribute("data-status", "ok"); }
    } else {
      // Test connection
      if (msg) { msg.textContent = "保存成功，测试连接中..."; msg.setAttribute("data-status", "info"); }
      try {
        const testResp = await fetch(apiUrl("/llm/test"), { method: "POST" });
        const testBody = await testResp.json();
        if (testResp.ok && testBody.ok) {
          if (msg) { msg.textContent = `✓ 已保存，连接 ${provider} 成功`; msg.setAttribute("data-status", "ok"); }
        } else {
          if (msg) { msg.textContent = `✓ 已保存；测试失败: ${testBody.error || "未知错误"}`; msg.setAttribute("data-status", "err"); }
        }
      } catch (testErr) {
        if (msg) { msg.textContent = `✓ 已保存；测试出错: ${testErr.message}`; msg.setAttribute("data-status", "err"); }
      }
    }
    loadHealth();
  } catch (err) {
    if (msg) { msg.textContent = `保存失败: ${err.message}`; msg.setAttribute("data-status", "err"); }
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
    b.setAttribute("aria-label", "折叠");
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
    btn.setAttribute("aria-label", collapse ? "展开" : "折叠");
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
      btn.setAttribute("aria-label", "展开");
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
  mb.textContent = exp >= all.length / 2 ? "⊟ 全部折叠" : "⊞ 全部展开";
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
  if (emotionSummary) emotionSummary.textContent = "待分析";
  if (llmSummary) llmSummary.textContent = "未配置外部模型";
  if (verificationSummary) verificationSummary.textContent = "待分析";
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
  setClassificationStatus("添加内容后自动判断场景和行业");
  exportButton.disabled = true;
  if (docViewer) docViewer.hidden = true;
  workspace?.classList.remove("has-document");
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
    message: "输入文本后开始分析。",
  });
  resetAllCollapsibles();
  updatePdfUploadVisibility();
  textArea.focus();
});

exportButton.addEventListener("click", exportLatestAnalysis);
clearHistoryButton.addEventListener("click", () => {
  if (confirm("确定要清空所有检测历史吗？此操作不可撤销。")) {
    clearHistory();
  }
});
historySummaryButton.addEventListener("click", summarizeHistoryTrends);
copyRewriteButton.addEventListener("click", async () => {
  if (!rewriteContent.textContent) return;
  try {
    await navigator.clipboard.writeText(rewriteContent.textContent);
    copyRewriteButton.textContent = "已复制";
    setTimeout(() => {
      copyRewriteButton.textContent = "复制改写文本";
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
  message: "输入文本后开始分析。",
});
exportButton.disabled = true;
setupResultTabs();
setupCardCollapse();
setupSettingsDrawer();
setupDeepAnalyze();
setupEvidenceUpload();
updateEvidenceBadge();
setInterval(updateEvidenceBadge, 60000);
updatePdfUploadVisibility();
loadHealth();
loadHistory();
registerServiceWorker();
setupPdfUpload();
setupThemeToggle();
