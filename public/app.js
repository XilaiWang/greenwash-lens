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
// 当 /analyze-jobs 端点失败时切换到同步 /analyze 路径作为降级
let preferLegacyAnalyze = false;
let llmAvailable = false;
const apiBase = resolveApiBase();
const localEngine = window.GreenwashLocal || null;
const isDesktopMode = new URLSearchParams(window.location.search).get("desktop") === "1";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function percent(value) {
  return `${Math.round(value)}%`;
}

function createEmptyResult() {
  return {
    risk: 0,
    claimProb: 0,
    confidence: 0,
    level: "待分析",
    tone: "green",
    summary: "输入文本后开始分析。",
    classification: null,
    components: {
      vagueness: 0,
      evidence: 0,
      overclaim: 0,
      promise: 0,
    },
    evidence: {
      quantified: false,
      timeline: false,
      proof: false,
      action: false,
      scope: false,
    },
    factors: ["暂无结果"],
    signals: ["暂无结果"],
  };
}

async function analyzeText() {
  const text = textArea.value.trim();

  if (!text) {
    latestAnalysis = null;
    exportButton.disabled = true;
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
    const requestPayload = {
      text,
      contextType: contextType.value,
      sector: sector.value,
    };

    if (preferLegacyAnalyze) {
      await runLegacyAnalysis(requestPayload);
      return;
    }

    const response = await fetch(apiUrl("/api/v1/analyze-jobs"), {
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

    const response = await fetch(apiUrl(`/api/v1/analyze-jobs/${encodeURIComponent(jobId)}`));
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
    const response = await fetch(apiUrl("/api/history?limit=12"));
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

function renderHistory(items) {
  historyList.innerHTML = "";

  if (!items.length) {
    historySummary.hidden = true;
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "暂无历史记录";
    historyList.append(empty);
    return;
  }

  items.forEach((item) => {
    const wrapper = document.createElement("div");
    const openButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const preview =
      item.request.text.length > 86 ? `${item.request.text.slice(0, 86)}...` : item.request.text;

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

function restoreHistoryItem(item) {
  const payload = normalizePayload(item, { allowClientVerification: true });

  textArea.value = item.request.text;
  contextType.value = item.request.contextType || "auto";
  sector.value = item.request.sector || "auto";
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
    const response = await fetch(apiUrl("/api/history"), { method: "DELETE" });

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
    const response = await fetch(apiUrl(`/api/v1/history/${encodeURIComponent(id)}`), {
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

function renderResult(result) {
  const colorMap = {
    green: "var(--green)",
    teal: "var(--teal)",
    amber: "var(--amber)",
    red: "var(--red)",
  };

  riskGauge.style.setProperty("--score", Math.round(result.risk));
  riskGauge.style.setProperty("--gauge-color", colorMap[result.tone] || "var(--muted)");
  riskScore.textContent = percent(result.risk);
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
}

function renderLlm(llm, serviceStatus) {
  const provider = serviceStatus?.provider || llm?.provider || "none";

  llmPanel.dataset.enabled = llm?.enabled ? "true" : "false";

  if (!llm) {
    llmSummary.textContent = "未配置外部模型 API，当前使用本地规则引擎。";
    renderList(llmAnnotations, ["暂无外部模型补充结果"]);
    return;
  }

  if (llm.error) {
    llmSummary.textContent = `${provider} 调用失败：${llm.error}`;
    renderList(llmAnnotations, ["本地规则引擎结果仍然可用。"]);
    return;
  }

  llmSummary.textContent = llm.enabled
    ? `${provider} · ${llm.model}：${llm.summary}`
    : `外部模型未启用：${llm.summary}`;
  renderList(
    llmAnnotations,
    llm.annotations && llm.annotations.length ? llm.annotations : ["暂无外部模型补充结果"],
  );
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

  if (!verification) {
    verificationSummary.textContent = "分析完成后会显示自动识别和外部模型的自我校验结果。";
    renderList(verificationChecks, ["暂无校验结果"]);
    verificationChecks.dataset.overall = "idle";
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
    response = await fetch(apiUrl("/api/v1/analyze"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    if (response.status === 404) {
      response = await fetch(apiUrl("/api/analyze"), {
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
    if (source === "llm") return "LLM";
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
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "分析中" : "分析";
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
  link.download = `greenwash-analysis-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadHealth() {
  try {
    const response = await fetch(apiUrl("/api/health"));
    const payload = await response.json();
    llmAvailable = Boolean(payload.llmService?.enabled);
    engineStatus.textContent = `应用已连接 · ${payload.engineVersion}`;
    updateHistorySummaryButton();
  } catch {
    if (localEngine) {
      const payload = localEngine.health();
      llmAvailable = Boolean(payload.llmService?.enabled);
      engineStatus.textContent = `离线可用 · ${payload.engineVersion}`;
      updateHistorySummaryButton();
      return;
    }
    llmAvailable = false;
    engineStatus.textContent = fileModeHint();
    updateHistorySummaryButton();
  }
}

function updateHistorySummaryButton() {
  if (!historySummaryButton) return;
  historySummaryButton.disabled = !llmAvailable;
  historySummaryButton.title = llmAvailable ? "" : "需要配置外部模型 API";
}

async function summarizeHistoryTrends() {
  if (!llmAvailable) return;

  try {
    historySummary.hidden = false;
    historySummary.textContent = "正在生成趋势分析...";
    const response = await fetch(apiUrl("/api/v1/history/summary"), {
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

  if (isDesktopMode) {
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
    const response = await fetch(apiUrl("/api/v1/upload-pdf"), {
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

    textArea.value = data.text;
    renderDocument(data.document || null);
    const engineLabel = data.engine === "poppler" ? "系统引擎" : "JS 引擎";
    const warnings = data.warnings || [];
    const stats = data.stats || {};
    let statusMsg = `已提取 ${data.text.length} 个字符（${engineLabel}）`;
    if (warnings.length) {
      statusMsg += ` · ${warnings.join(" ")}`;
    }
    statusMsg += ` · ${file.name}`;
    setPdfUploadState("success", statusMsg);
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
    return;
  }

  docViewer.hidden = false;
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
    let html = node.textContent;
    let changed = false;
    signalMap.forEach((cssClass, term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "gi");
      if (regex.test(html)) {
        html = html.replace(regex, `<mark class="${cssClass}">$1</mark>`);
        changed = true;
      }
    });
    if (changed) {
      const span = document.createElement("span");
      span.innerHTML = html;
      node.parentNode.replaceChild(span, node);
    }
  });
}

docViewerClose.addEventListener("click", () => {
  if (docViewer) docViewer.hidden = true;
  currentDocument = null;
  if (docViewerBody) docViewerBody.innerHTML = "";
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  analyzeText();
});

sampleButton.addEventListener("click", () => {
  textArea.value = sampleText;
  form.requestSubmit();
});

clearButton.addEventListener("click", () => {
  textArea.value = "";
  latestAnalysis = null;
  currentDocument = null;
  exportButton.disabled = true;
  if (docViewer) docViewer.hidden = true;
  if (docViewerBody) docViewerBody.innerHTML = "";
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
});

exportButton.addEventListener("click", exportLatestAnalysis);
clearHistoryButton.addEventListener("click", clearHistory);
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
loadHealth();
loadHistory();
registerServiceWorker();
setupPdfUpload();
