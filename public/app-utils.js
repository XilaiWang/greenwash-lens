// Greenwashing Lens — Shared utilities
// Load before app.js

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function percent(value) {
  return `${Math.round(value)}%`;
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
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${seconds} 秒`;
}

function labelForContext(value) {
  const labels = {
    auto: "智能识别", marketing: "营销文案", product: "产品描述", report: "ESG/CSR 报告",
    social: "社媒内容", press_release: "新闻稿/公关", investor_relations: "投资者关系",
    policy: "政策/法规", employer_branding: "雇主品牌",
  };
  return labels[value] || "通用场景";
}

function labelForSector(value) {
  const labels = {
    auto: "智能识别", general: "通用", energy: "能源/化工", fashion: "服装/零售",
    aviation: "航空/物流", manufacturing: "制造业", finance: "金融", technology: "科技",
    food_agriculture: "食品/农业", construction_realestate: "建筑/房地产",
    automotive: "汽车/交通", consumer_goods: "消费品/日化", healthcare: "医药/健康",
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
    idle: "待开始", creating: "创建任务", queued: "排队中", classifying: "自动识别",
    scoring: "本地规则评分", "nlp-local": "NLP 情绪模型", "nlp-skip": "跳过 NLP",
    llm: "外部模型增强", rule_engine: "本地规则评分", rule_preview: "本地结果预览",
    llm_enrichment: "外部模型增强", verification: "自我校验", saving: "保存记录",
    fallback: "切换直连模式", completed: "分析完成", failed: "分析失败",
  };
  return labels[stage] || "分析中";
}

function resolveApiBase() {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("apiBase");
  if (explicit) return explicit.replace(/\/+$/, "");
  if (window.location.protocol === "file:") return "http://127.0.0.1:5173";
  return window.location.origin.replace(/\/+$/, "");
}

function apiUrl(pathname) {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const base = resolveApiBase();
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function fileModeHint() {
  if (window.location.protocol === "file:") {
    return `当前页面是文件模式，正在尝试连接本地服务 ${resolveApiBase()}`;
  }
  return "如果卡住太久，建议先检查应用服务和外部模型服务状态。";
}

function buildUnavailableMessage() {
  if (window.location.protocol === "file:") {
    return `当前页面是通过文件方式打开的，必须先启动本地应用服务，然后连接到 ${resolveApiBase()} 才能调用分析接口。`;
  }
  return "当前应用服务不可用，请确认应用已启动。";
}

function createEmptyResult() {
  return {
    risk: 0, claimProb: 0, confidence: 0, level: "待分析", tone: "green",
    summary: "输入文本后开始分析。", classification: null,
    components: { vagueness: 0, evidence: 0, overclaim: 0, promise: 0 },
    evidence: { quantified: false, timeline: false, proof: false, action: false, scope: false },
    factors: ["暂无结果"], signals: ["暂无结果"],
    emotionAnalysis: createEmptyEmotionAnalysis(),
  };
}

function createEmptyEmotionAnalysis() {
  return {
    finalScore: 0, level: "none", consistency: 0, layersUsed: 1,
    breakdown: { rule: 0, nlp: null, llm: null }, nlpDetail: null,
  };
}

function normalizePayload(payload, { allowClientVerification = false } = {}) {
  if (!payload || payload.verification || !allowClientVerification) return payload;
  return { ...payload, verification: buildClientVerification(payload) };
}

function buildClientVerification(payload) {
  const checks = [];
  const classification = payload.classification || payload.result?.classification;
  const result = payload.result;
  const llm = payload.llm;

  if (classification?.context) checks.push(buildClientClassificationCheck("文本场景识别", classification.context));
  if (classification?.sector) checks.push(buildClientClassificationCheck("行业识别", classification.sector));

  if (result) {
    checks.push(
      result.confidence < 55
        ? { id: "rule_confidence_low", status: "warn", title: "本地规则置信度", message: "本地规则对当前文本的把握一般，建议结合原文复核。" }
        : { id: "rule_confidence_ok", status: "pass", title: "本地规则置信度", message: `本地规则引擎置信度为 ${Math.round(result.confidence)}%。` }
    );
  }

  if (!llm || !llm.enabled) {
    checks.push({
      id: "llm_disabled", status: "warn", title: "外部模型增强",
      message: llm?.error ? `外部模型本轮未正常返回：${llm.error}` : "当前结果没有拿到外部模型增强，主要依据本地规则生成。",
    });
  } else {
    checks.push({ id: "llm_enabled", status: "pass", title: "外部模型增强", message: `已启用 ${llm.provider} · ${llm.model}。` });
    if (Number.isFinite(llm.adjustedRisk) && result) {
      const gap = Math.abs(llm.adjustedRisk - result.risk);
      checks.push({
        id: "llm_gap", status: gap > 25 ? "warn" : "pass", title: "外部模型一致性",
        message: gap > 25 ? `外部模型与本地规则分差较大（${gap} 分），建议人工复核。` : `外部模型与本地规则分差可接受（${gap} 分）。`,
      });
    }
  }

  const overall = checks.some((c) => c.status === "fail") ? "fail"
    : checks.some((c) => c.status === "warn") ? "warn" : "pass";

  return { overall, checks, generatedAt: new Date().toISOString() };
}

function buildClientClassificationCheck(title, part) {
  const confidence = part?.detected?.confidence ?? 0;
  if (part?.source === "manual") {
    return { id: `${title}-manual`, status: "pass", title, message: "当前结果使用了人工覆盖，不依赖自动识别。" };
  }
  if (confidence < 0.55) {
    return { id: `${title}-low`, status: "warn", title, message: `自动识别置信度偏低（${Math.round(confidence * 100)}%），建议人工复核。` };
  }
  return { id: `${title}-ok`, status: "pass", title, message: `自动识别置信度正常（${Math.round(confidence * 100)}%）。` };
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
