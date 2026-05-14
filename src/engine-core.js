(function attachEngineCore(root, factory) {
  const exported = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  }

  if (root && typeof root === "object") {
    root.GreenwashEngineCore = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createEngineCore() {
  const ENGINE_VERSION = "engine-core-0.9.0";
  const CLAIM_THRESHOLD = 42;
  const MIN_GREEN_CLAIM_TOKENS = 15;
  const sampleText =
    "我们致力于打造更绿色的未来。该系列产品采用环保材料，显著减少对环境的影响，并计划在2030年前实现碳中和。";

  const dictionaries = {
    greenClaims: [
      "green",
      "eco",
      "environment",
      "sustainable",
      "sustainability",
      "carbon",
      "emission",
      "net zero",
      "climate",
      "renewable",
      "recyclable",
      "biodegradable",
      "circular",
      "zero waste",
      "low-carbon",
      "decarbonization",
      "decarbonisation",
      "clean energy",
      "energy efficient",
      "emissions reduction",
      "climate positive",
      "绿色",
      "环保",
      "可持续",
      "低碳",
      "碳中和",
      "净零",
      "减排",
      "排放",
      "气候",
      "可再生",
      "回收",
      "循环",
      "降解",
      "节能",
      "清洁能源",
      "绿色生产",
      "绿色供应链",
      "绿色包装",
      "节水",
      "生态",
      "esg",
    ],
    vague: [
      "aim",
      "strive",
      "committed to",
      "leading",
      "greener",
      "eco-friendly",
      "planet-friendly",
      "minimize impact",
      "sustainable future",
      "responsible choice",
      "better for the planet",
      "nature positive",
      "conscious",
      "cleaner future",
      "low impact",
      "致力于",
      "努力",
      "持续推进",
      "绿色未来",
      "更绿色",
      "更环保",
      "环境友好",
      "显著",
      "有效",
      "积极",
      "全面",
      "助力",
      "打造",
      "引领",
      "不断",
      "守护地球",
      "绿色生活",
      "自然之选",
      "低影响",
    ],
    absolute: [
      "100%",
      "zero emissions",
      "carbon neutral",
      "net zero",
      "no environmental impact",
      "planet positive",
      "completely sustainable",
      "all natural",
      "fully green",
      "best in class",
      "guilt-free",
      "零排放",
      "碳中和",
      "净零",
      "无污染",
      "对环境无影响",
      "完全可持续",
      "百分百环保",
      "全部使用",
      "行业领先",
      "最环保",
    ],
    proof: [
      "third-party",
      "verified",
      "certified",
      "audited",
      "assurance",
      "iso",
      "gri",
      "sbti",
      "cdp",
      "lca",
      "life cycle",
      "methodology",
      "science based",
      "independently verified",
      "第三方",
      "核证",
      "认证",
      "审计",
      "鉴证",
      "生命周期",
      "方法学",
      "数据来源",
      "科学碳目标",
      "独立验证",
    ],
    future: [
      "will",
      "plan to",
      "pledge",
      "target",
      "roadmap",
      "by 2030",
      "by 2050",
      "commitment",
      "ambition",
      "goal",
      "将",
      "计划",
      "承诺",
      "目标",
      "路线图",
      "到2030",
      "到2050",
      "未来",
      "愿景",
    ],
    emotional: [
      "next generation",
      "our children",
      "for our children",
      "for the planet",
      "for future generations",
      "guilt-free",
      "responsible choice",
      "save the planet",
      "climate emergency",
      "last chance",
      "future generations",
      "为了子孙",
      "下一代",
      "我们的孩子",
      "共同责任",
      "守护地球",
      "你的选择",
      "从我做起",
      "绿色未来",
      "美好家园",
      "引领变革",
      "刻不容缓",
      "迫在眉睫",
      "气候紧急",
      "最后机会",
    ],
    action: [
      "reduced",
      "achieved",
      "implemented",
      "installed",
      "replaced",
      "invested",
      "measured",
      "reported",
      "purchased renewable",
      "completed",
      "cut emissions",
      "transitioned",
      "已",
      "已经",
      "完成",
      "减少了",
      "降低了",
      "实施",
      "安装",
      "替换",
      "投入",
      "采购",
      "披露",
      "核算",
      "转型",
    ],
    scope: [
      "scope 1",
      "scope 2",
      "scope 3",
      "baseline",
      "base year",
      "范围一",
      "范围二",
      "范围三",
      "基准年",
      "边界",
      "产品边界",
      "组织边界",
    ],
  };

  const highImpactSectors = new Set(["energy", "fashion", "aviation", "manufacturing"]);

  function scoreText(text, rawOptions) {
    const clean = String(text || "").trim();
    const options = normalizeOptions(rawOptions);

    if (!clean) {
      return createEmptyResult();
    }

    const metrics = collectTextMetrics(clean);
    const greenMatches = findMatches(clean, dictionaries.greenClaims);
    const vagueMatches = findMatches(clean, dictionaries.vague);
    const absoluteMatches = findMatches(clean, dictionaries.absolute);
    const proofMatches = findMatches(clean, dictionaries.proof);
    const futureMatches = findMatches(clean, dictionaries.future);
    const emotionalMatches = findMatches(clean, dictionaries.emotional);
    const actionMatches = findMatches(clean, dictionaries.action);
    const scopeMatches = findMatches(clean, dictionaries.scope);

    const quantified = hasQuantification(clean);
    const timeline = hasTimeline(clean);
    const hasProof = proofMatches.length > 0;
    const hasAction = actionMatches.length > 0;
    const hasScope = scopeMatches.length > 0;

    let emotional = emotionalMatches.length * 7;
    if (vagueMatches.length > 0) emotional += 4;
    if (futureMatches.length > 0) emotional += 4;
    emotional = clamp(emotional, 0, 30);

    const greenDensity = greenMatches.length / Math.max(1, metrics.densityUnits / 24);
    const claimProb = clamp(18 + greenMatches.length * 16 + greenDensity * 16);
    const isGreenClaim =
      greenMatches.length >= 2 &&
      claimProb >= CLAIM_THRESHOLD &&
      metrics.tokenUnits >= MIN_GREEN_CLAIM_TOKENS;

    if (!isGreenClaim) {
      return {
        risk: 8,
        claimProb,
        confidence: clamp(54 + Math.min(metrics.tokenUnits, 80) * 0.35),
        decisionMode: "non-green-claim-baseline",
        claimThreshold: CLAIM_THRESHOLD,
        minClaimTokens: MIN_GREEN_CLAIM_TOKENS,
        classification: options.classification,
        level: "低风险",
        tone: "green",
        summary:
          "这段文本没有被识别为明显绿色声明，当前返回的是基线低风险分，而不是高强度 greenwashing 判定。",
        components: {
          vagueness: 5,
          evidence: 4,
          overclaim: 2,
          promise: 2,
          emotional,
        },
        evidence: {
          quantified,
          timeline,
          proof: hasProof,
          action: hasAction,
          scope: hasScope,
        },
        factors: ["未检测到强绿色声明"],
        signals: greenMatches.length ? greenMatches.slice(0, 4) : ["未命中特定片段"],
      };
    }

    let vagueness = vagueMatches.length * 8;
    if (!quantified) vagueness += 12;
    if (!timeline) vagueness += 6;
    vagueness = clamp(vagueness, 0, 35);

    let evidence = 0;
    if (!hasProof) evidence += 18;
    if (!quantified) evidence += 10;
    if (!hasScope) evidence += 7;
    if (absoluteMatches.length > 0 && !hasProof) evidence += 8;
    evidence = clamp(evidence, 0, 38);

    let overclaim = absoluteMatches.length * 10;
    if (vagueMatches.length >= 2 && !quantified) overclaim += 7;
    if (options.contextType === "marketing" || options.contextType === "product") {
      overclaim += absoluteMatches.length > 0 ? 5 : 0;
    }
    overclaim = clamp(overclaim, 0, 28);

    let promise = futureMatches.length * 5;
    if (futureMatches.length > actionMatches.length) promise += 10;
    if (timeline && !hasAction) promise += 4;
    promise = clamp(promise, 0, 28);

    let risk = 12 + vagueness + evidence + overclaim + promise;

    if (hasProof) risk -= 10;
    if (quantified && timeline) risk -= 8;
    if (hasAction && quantified) risk -= 6;
    if (highImpactSectors.has(options.sector)) risk += 5;
    if (options.contextType === "report" && metrics.tokenUnits > 90 && !hasProof) risk += 4;
    risk = clamp(risk, 6, 92);

    const confidence = clamp(
      48 + Math.min(metrics.tokenUnits, 140) * 0.22 + greenMatches.length * 4 + (hasProof ? 8 : 0),
      35,
      88,
    );

    const factors = buildFactors({
      vagueMatches,
      absoluteMatches,
      futureMatches,
      actionMatches,
      quantified,
      timeline,
      hasProof,
      hasScope,
      sector: options.sector,
    });

    const signals = [
      ...greenMatches.map((item) => `绿色声明: ${item}`),
      ...vagueMatches.map((item) => `模糊表述: ${item}`),
      ...absoluteMatches.map((item) => `强断言: ${item}`),
      ...futureMatches.slice(0, 3).map((item) => `未来承诺: ${item}`),
    ].slice(0, 7);

    return {
      risk,
      claimProb,
      confidence,
      decisionMode: "green-claim-risk",
      claimThreshold: CLAIM_THRESHOLD,
      minClaimTokens: MIN_GREEN_CLAIM_TOKENS,
      classification: options.classification,
      level: getLevel(risk),
      tone: getTone(risk),
      summary: getSummary(risk, hasProof, quantified, timeline),
      components: {
        vagueness,
        evidence,
        overclaim,
        promise,
        emotional,
      },
      evidence: {
        quantified,
        timeline,
        proof: hasProof,
        action: hasAction,
        scope: hasScope,
      },
      factors,
      signals: signals.length ? signals : ["未命中特定片段"],
    };
  }

  function createEmptyResult() {
    return {
      risk: 0,
      claimProb: 0,
      confidence: 0,
      decisionMode: "empty",
      claimThreshold: CLAIM_THRESHOLD,
      minClaimTokens: MIN_GREEN_CLAIM_TOKENS,
      level: "待分析",
      tone: "green",
      summary: "输入文本后开始分析。",
      components: {
        vagueness: 0,
        evidence: 0,
        overclaim: 0,
        promise: 0,
        emotional: 0,
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

  function collectTextMetrics(text) {
    const latinWords = text.match(/[a-zA-Z]+(?:[-'][a-zA-Z]+)?/g) || [];
    const cjkChars = text.match(/[\u4e00-\u9fff]/g) || [];
    const densityUnits = text.replace(/\s+/g, "").length;
    const tokenUnits = latinWords.length + cjkChars.length;

    return {
      latinWordCount: latinWords.length,
      cjkCharCount: cjkChars.length,
      densityUnits,
      tokenUnits,
    };
  }

  function normalizeOptions(options) {
    const classification = (options && options.classification) || {};

    return {
      contextType: (options && options.contextType) || classification.context?.selected || "marketing",
      sector: (options && options.sector) || classification.sector?.selected || "general",
      classification,
    };
  }

  function buildFactors(data) {
    const factors = [];

    if (data.vagueMatches.length) {
      factors.push("存在模糊或愿景式表达，缺少可直接验证的边界。");
    }

    if (!data.quantified) {
      factors.push("缺少量化指标，难以判断环境改善幅度。");
    }

    if (!data.timeline) {
      factors.push("缺少明确时间边界或阶段目标。");
    }

    if (!data.hasProof) {
      factors.push("未出现第三方认证、审计、方法学或数据来源。");
    }

    if (data.futureMatches.length > data.actionMatches.length) {
      factors.push("未来承诺多于已完成行动，存在承诺落差风险。");
    }

    if (data.absoluteMatches.length) {
      factors.push("存在绝对化或高强度绿色断言，需要更强证据支撑。");
    }

    if (!data.hasScope) {
      factors.push("缺少排放范围、产品边界或基准年信息。");
    }

    if (highImpactSectors.has(data.sector)) {
      factors.push("所选行业环境影响较高，声明需要更严格的证据核验。");
    }

    return factors.length ? factors : ["文本具备较完整的量化、时间和证据要素。"];
  }

  function findMatches(text, terms) {
    const lower = text.toLowerCase();
    return terms.filter((term) => lower.includes(term.toLowerCase()));
  }

  function hasQuantification(text) {
    return /(\d+(\.\d+)?\s?(%|percent|tco2e|co2e|tonnes?|tons?|kg|kwh|mwh|gwh|mw|gw|公吨|吨|千克|万吨|%|％))/.test(
      text.toLowerCase(),
    );
  }

  function hasTimeline(text) {
    return /(20\d{2}|by\s+20\d{2}|fy\s?20\d{2}|到20\d{2}年?|截至20\d{2}年?|在20\d{2}年前)/i.test(
      text,
    );
  }

  function getLevel(score) {
    if (score >= 75) return "高风险";
    if (score >= 50) return "中高风险";
    if (score >= 28) return "中低风险";
    return "低风险";
  }

  function getTone(score) {
    if (score >= 75) return "red";
    if (score >= 50) return "amber";
    if (score >= 28) return "teal";
    return "green";
  }

  function getSummary(score, hasProof, quantified, timeline) {
    if (score >= 75) {
      return "该文本包含明显绿色声明，但证据、边界或行动支撑不足，建议优先进入人工核验。";
    }

    if (score >= 50) {
      return "该文本存在若干 greenwashing 风险信号，尤其需要补充可验证数据和外部证明。";
    }

    if (score >= 28) {
      return "该文本有绿色声明，也具备部分可核验要素，整体风险处于可复核区间。";
    }

    if (hasProof && quantified && timeline) {
      return "该文本包含量化指标、时间边界和证明线索，当前文本层面的风险较低。";
    }

    return "该文本的 greenwashing 风险较低，但完整判断仍需要结合外部证据。";
  }

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    ENGINE_VERSION,
    CLAIM_THRESHOLD,
    MIN_GREEN_CLAIM_TOKENS,
    sampleText,
    createEmptyResult,
    scoreText,
  };
});
