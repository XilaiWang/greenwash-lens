(function () {
  const translations = {
    zh: {
      // topbar
      'topbar.title': '绿色声明风险检测',
      'topbar.ariaLabel': '应用标题',
      'topbar.collapseAll': '全部折叠',
      'topbar.expandAll': '全部展开',
      'topbar.settings': '设置',
      'topbar.toggleDark': '切换暗色模式',
      'topbar.engineStarting': '应用启动中',

      // build info bar
      'buildInfo.checking': '检查版本中…',
      'buildInfo.view': '查看',

      // workspace / input panel labels
      'workspace.ariaLabel': '检测工作区',
      'input.cardTitle': '输入',

      // guide
      'guide.startLabel': '开始方式',
      'guide.heading': '上传 PDF 或粘贴文本',
      'guide.stepsLabel': '使用流程',
      'guide.step1': '1 添加内容',
      'guide.step2': '2 自动识别',
      'guide.step3': '3 开始分析',

      // classification / field labels
      'field.smartRecognition': '智能识别',
      'field.classificationStatusDefault': '添加内容后自动判断场景和行业',
      'field.contextType': '文本场景',
      'field.sector': '行业',
      'field.contextAuto': '智能识别',
      'field.contextMarketing': '营销文案',
      'field.contextProduct': '产品描述',
      'field.contextReport': 'ESG/CSR 报告',
      'field.contextSocial': '社媒内容',
      'field.contextPressRelease': '新闻稿/公关',
      'field.contextInvestorRelations': '投资者关系',
      'field.contextPolicy': '政策/法规',
      'field.contextEmployerBranding': '雇主品牌',
      'field.sectorAuto': '智能识别',
      'field.sectorGeneral': '通用',
      'field.sectorEnergy': '能源/化工',
      'field.sectorFashion': '服装/零售',
      'field.sectorAviation': '航空/物流',
      'field.sectorManufacturing': '制造业',
      'field.sectorFinance': '金融',
      'field.sectorTechnology': '科技',
      'field.sectorFoodAgriculture': '食品/农业',
      'field.sectorConstructionRealestate': '建筑/房地产',
      'field.sectorAutomotive': '汽车/交通',
      'field.sectorConsumerGoods': '消费品/日化',
      'field.sectorHealthcare': '医药/健康',

      // analysis mode
      'field.modeAuto': '自动',
      'field.modeFast': '快速（关键词）',
      'field.modeStandard': '标准（+LLM 结构化）',
      'field.modeComprehensive': '全面（+认证+七宗罪+GRI）',
      'field.modeDepth': '分析深度',

      // pdf upload
      'pdf.ariaLabel': '上传 PDF 文件',
      'pdf.kicker': 'PDF 文件',
      'pdf.label': '拖拽到此处，或',
      'pdf.labelLink': '点击选择文件',
      'pdf.hint': '提取文本后会自动识别场景和行业',
      'pdf.claimTextLabel': '待检测文本',
      'pdf.placeholder': '粘贴一段绿色、环保、低碳、ESG 或可持续相关表述',

      // buttons
      'btn.startAnalysis': '开始分析',
      'btn.analyzing': '分析中',
      'btn.sample': '示例',
      'btn.clear': '清空',
      'btn.exportJson': '导出 JSON',
      'btn.deepAnalyze': '深度分析',
      'btn.deepAnalyzeInfo': 'M3/M4/M5 深度分析（模糊度、包装强度、承诺-行动落差），输出 TGRI 综合风险指数。',
      'btn.collapseAll': '全部折叠',
      'btn.expandAll': '全部展开',
      'btn.copyRewrite': '复制改写文本',
      'btn.copied': '已复制',
      'btn.trendAnalysis': '趋势分析',
      'btn.clearHistory': '清空历史',

      // result panel
      'result.cardTitle': '检测结果',
      'result.ariaLabel': '检测结果',

      // welcome panel
      'welcome.title': '等待分析结果',
      'welcome.desc': '添加内容后，左侧会先完成场景与行业识别；点击"开始分析"后，这里展示风险评分、证据缺口和详细诊断。',
      'welcome.tryButton': '试试示例文本',

      // score panel
      'score.riskLabel': '待分析',
      'score.summaryDefault': '输入文本后开始分析。',
      'score.riskProbLabel': 'Greenwashing 风险概率',
      'score.langPending': '语言：待识别',
      'score.scenePending': '场景：待识别',
      'score.industryPending': '行业：待识别',
      'score.claimProbLabel': '绿色声明概率',
      'score.confidenceLabel': '判断置信度',
      'score.analysisNoteDefault': '分析完成后会显示这次分数是完整风险判断，还是非绿色声明基线分。',

      // progress panel
      'progress.ariaLabel': '分析进度',
      'progress.heading': '分析进度',
      'progress.idle': '输入文本后开始分析。',
      'progress.labelIdle': '待开始',
      'progress.labelCreating': '创建任务',
      'progress.labelQueued': '排队中',
      'progress.labelRunning': '分析中',
      'progress.labelCompleted': '已完成',
      'progress.labelFailed': '失败',
      'progress.labelStalled': '耗时偏长',
      'progress.labelDefault': '分析中',

      // tabs
      'tab.overview': '概览',
      'tab.details': '细节',
      'tab.advanced': '高级',
      'tab.ariaLabel': '分析结果视图',

      // breakdown
      'breakdown.vagueness': '模糊表述',
      'breakdown.evidence': '证据缺口',
      'breakdown.overclaim': '夸大风险',
      'breakdown.promise': '承诺落差',

      // evidence strip
      'evidence.quantified': '量化指标',
      'evidence.timeline': '时间边界',
      'evidence.proof': '外部证明',
      'evidence.action': '行动证据',
      'evidence.scope': '范围/基准',

      // v2 overview
      'v2.mainRisks': '主要风险点',
      'v2.claimsLabel': '逐条声明分析（',
      'v2.consistencyLabel': '一致性分析',

      // v2 sins
      'v2.sin.hiddenTradeoff': '隐藏权衡',
      'v2.sin.noProof': '无证据',
      'v2.sin.vagueness': '模糊',
      'v2.sin.falseLabels': '伪标签',
      'v2.sin.irrelevance': '不相关',
      'v2.sin.lesserOfEvils': '两害取其轻',
      'v2.sin.fibbing': '虚假陈述',

      // v2 claim structure
      'v2.structuredDetails': '结构化详情',
      'v2.noStructuredData': '无结构化数据',
      'v2.contradiction': '矛盾',

      // findings
      'findings.cardTitle': '风险因子 & 命中片段',
      'findings.riskFactors': '风险因子',
      'findings.matchedSignals': '命中片段',
      'findings.noResults': '暂无结果',

      // llm panel
      'llm.cardTitle': 'LLM 增强判断',
      'llm.noApiConfig': '未配置外部模型 API，当前使用本地规则引擎。',
      'llm.noResults': '暂无外部模型补充结果',
      'llm.noConfig': '未配置外部模型',
      'llm.notEnabled': '外部模型未启用',
      'llm.vagueTitle': '模糊表述诊断与改写建议',
      'llm.contradictionTitle': '逻辑矛盾检测',
      'llm.credibilityTitle': '声明可信度评估',
      'llm.rewriteTitle': '合规改写建议',

      // emotion panel
      'emotion.cardTitle': '三层情绪检测',
      'emotion.pendingDefault': '待分析。',
      'emotion.warning': '三层结果分歧较大，建议人工复核。',
      'emotion.ruleLayer': '规则层',
      'emotion.nlpLayer': 'NLP层',
      'emotion.llmLayer': 'LLM层',
      'emotion.offline': '离线',
      'emotion.level.none': '无明显风险',
      'emotion.level.low': '低',
      'emotion.level.medium': '中',
      'emotion.level.high': '高',
      'emotion.explain.none': '未检测到明显的情感操控倾向，文本语气较为中性客观。',
      'emotion.explain.low': '文本带有轻微的正面情感色彩，属于正常的品牌表达范畴。',
      'emotion.explain.medium': '文本存在一定的情感诉求策略，可能试图通过情绪引导影响判断，建议结合具体措辞复核。',
      'emotion.explain.high': '文本情感操控倾向显著，大量使用高度情绪化的表达，可能存在误导性渲染。',
      'emotion.explainPending': '分析完成后，这里会用通俗语言解释文本的情绪倾向。',
      'emotion.consistencyLabel': '一致性：{pct}%',
      'emotion.consistencyPending': '一致性：待计算',
      'emotion.consistencyAnalyzing': '一致性：待分析',
      'emotion.layersLabel': '使用层数：{n}',
      'emotion.layersAnalyzing': '使用层数：待分析',
      'emotion.summaryPending': '待分析',
      'emotion.summaryHigh': '情绪风险高 · {score}分 · 建议复核',
      'emotion.summaryMedium': '情绪风险中 · {score}分',
      'emotion.summaryLow': '情绪风险低 · {score}分',
      'emotion.nlpNotParticipated': 'NLP 层本轮未参与',
      'emotion.nlpOffline': 'NLP 服务离线',

      // verification panel
      'verification.cardTitle': '结果自检',
      'verification.ariaLabel': '结果自检',
      'verification.pendingDesc': '分析完成后会显示自动识别和外部模型的自我校验结果。',
      'verification.noResults': '暂无校验结果',
      'verification.statusPending': '待分析',
      'verification.overall.pass': '本次分析的自动识别和外部模型结果整体可采信。',
      'verification.overall.warn': '本次分析存在需要人工留意的环节，建议结合原文复核。',
      'verification.overall.fail': '本次分析出现明显异常，建议先不要直接采信结果。',
      'verification.overallDone': '已完成校验。',
      'verification.statusLabel.pass': '通过',
      'verification.statusLabel.warn': '提示',
      'verification.statusLabel.fail': '异常',
      'verification.overallLabel.pass': '通过',
      'verification.overallLabel.warn': '提示',
      'verification.overallLabel.fail': '异常',
      'verification.overallLabel.done': '已完成',
      'verification.summaryCount': '{label} · {n}项校验',

      // history panel
      'history.cardTitle': '检测历史',
      'history.recentLabel': '最近分析',
      'history.ariaLabel': '最近分析',
      'history.noRecords': '暂无历史记录',
      'history.chartTitle': '风险评分趋势',
      'history.chartAriaLabel': '风险评分趋势图',
      'history.legendScore': '风险评分',
      'history.legendAvg': '移动平均',
      'history.recentCount': '最近 {n} 次分析',
      'history.deleteAriaLabel': '删除这条历史记录',
      'history.trendSummaryTitle': '需要配置外部模型 API',
      'history.clearConfirm': '确定要清空所有检测历史吗？此操作不可撤销。',

      // settings drawer
      'settings.title': '设置',
      'settings.close': '关闭',
      'settings.cancel': '取消',
      'settings.saveAndTest': '保存并测试',
      'settings.providerGroup': '活跃 Provider',
      'settings.providerNone': '无（本地规则）',
      'settings.apiKeyLabel': 'API Key',
      'settings.apiKeyPlaceholder': '保留原值不变 / 输入新 Key',
      'settings.modelLabel': '模型',
      'settings.modelPlaceholder': '模型名',
      'settings.showHide': '显示/隐藏',
      'settings.otherGroup': '其它',
      'settings.timeoutLabel': '请求超时（ms）',
      'settings.unconfigured': '未配置',
      'settings.configured': '已配置',
      'settings.saving': '保存中...',
      'settings.savedNoProvider': '✓ 已保存 — 未使用外部 Provider',
      'settings.savedTesting': '保存成功，测试连接中...',
      'settings.savedConnected': '✓ 已保存，连接 {provider} 成功',
      'settings.savedTestFailed': '✓ 已保存；测试失败: {error}',
      'settings.savedTestError': '✓ 已保存；测试出错: {error}',
      'settings.loadFailed': '加载设置失败: {error}',
      'settings.saveFailed': '保存失败: {error}',

      // status / engine messages
      'status.connected': '应用已连接 · {version}',
      'status.disconnected': '应用未连接',
      'status.offline': '离线可用 · {version}',
      'status.historyDisabled': ' · 历史已关闭',
      'status.analyzing': '分析状态 · {stage} · {pct}%',
      'status.needsExternalModel': '需要配置外部模型 API',

      // stage labels
      'stage.idle': '待开始',
      'stage.creating': '创建任务',
      'stage.queued': '排队中',
      'stage.classifying': '自动识别',
      'stage.scoring': '本地规则评分',
      'stage.nlpLocal': 'NLP 情绪模型',
      'stage.nlpSkip': '跳过 NLP',
      'stage.llm': '外部模型增强',
      'stage.ruleEngine': '本地规则评分',
      'stage.rulePreview': '本地结果预览',
      'stage.llmEnrichment': '外部模型增强',
      'stage.verification': '自我校验',
      'stage.saving': '保存记录',
      'stage.fallback': '切换直连模式',
      'stage.completed': '分析完成',
      'stage.failed': '分析失败',
      'stage.default': '分析中',

      // classification strip / labels
      'classification.autoHint': '添加内容后自动判断场景和行业',
      'classification.loadingHint': '输入停止后自动识别场景和行业',
      'classification.manualHint': '使用当前手动选择的场景和行业',
      'classification.aiIdentified': '{method}已识别：{context} · {sector}',
      'classification.errorFallback': '自动识别暂不可用，将在分析时识别',
      'classification.langPending': '语言：待识别',
      'classification.scenePending': '场景：待识别',
      'classification.industryPending': '行业：待识别',
      'classification.langLine': '语言：{lang}',
      'classification.sceneLine': '场景：{label} · {source}',
      'classification.industryLine': '行业：{label} · {source}',
      'classification.sourceAI': 'AI',
      'classification.sourceManual': '手动',
      'classification.sourceKeyword': '关键词',
      'classification.pdfLoading': 'PDF 已提取，正在用 AI 识别场景和行业...',
      'classification.aiLoading': '正在用 AI 识别场景和行业...',
      'classification.contextSector.context.title': '文本场景识别',
      'classification.contextSector.sector.title': '行业识别',

      // context type labels (for labelForContext fn)
      'context.auto': '智能识别',
      'context.marketing': '营销文案',
      'context.product': '产品描述',
      'context.report': 'ESG/CSR 报告',
      'context.social': '社媒内容',
      'context.press_release': '新闻稿/公关',
      'context.investor_relations': '投资者关系',
      'context.policy': '政策/法规',
      'context.employer_branding': '雇主品牌',
      'context.general': '通用场景',

      // sector labels (for labelForSector fn)
      'sector.auto': '智能识别',
      'sector.general': '通用',
      'sector.energy': '能源/化工',
      'sector.fashion': '服装/零售',
      'sector.aviation': '航空/物流',
      'sector.manufacturing': '制造业',
      'sector.finance': '金融',
      'sector.technology': '科技',
      'sector.food_agriculture': '食品/农业',
      'sector.construction_realestate': '建筑/房地产',
      'sector.automotive': '汽车/交通',
      'sector.consumer_goods': '消费品/日化',
      'sector.healthcare': '医药/健康',
      'sector.default': '通用',

      // pdf upload states
      'pdf.errorFormat': '请上传 PDF 格式的文件。',
      'pdf.errorSize': '文件过大，请上传 20MB 以内的 PDF。',
      'pdf.processing': '正在提取文字...',
      'pdf.extractFailed': 'PDF 文字提取失败',
      'pdf.extractError': '提取失败，请重试。',
      'pdf.engineSystem': '系统引擎',
      'pdf.engineJs': 'JS 引擎',
      'pdf.optimized': ' · 已优化长文档',
      'pdf.extracted': '已提取 {chars} 个字符 · {engine}',

      // doc viewer
      'docviewer.ariaLabel': '文档阅读器',
      'docviewer.title': '文档阅读器',
      'docviewer.close': '收起',
      'docviewer.pageMarker': '第 {n} 页',
      'docviewer.tableLabel': '表格内容',
      'docviewer.pageNumber': '{current} / {total}',

      // deep analysis
      'deep.cardTitle': 'M3/M4/M5 深度分析',
      'deep.m3Title': 'M3 模糊度',
      'deep.m4Title': 'M4 包装强度',
      'deep.m5Title': 'M5 承诺-行动落差',
      'deep.tgriLabel': 'TGRI 综合风险指数',
      'deep.tgriPending': '待分析',
      'deep.claimsLabel': '声明逐条分析（',
      'deep.keyFindings': '关键发现',
      'deep.recommendations': '改进建议',
      'deep.confidenceLabel': '置信度：',
      'deep.noModel': '未启用外部模型',
      'deep.noResults': '暂无',
      'deep.noClaims': '未识别出可分析的声明',
      'deep.errorPrefix': '深度分析失败: ',
      'deep.m3Detail': '模糊词比 {ratio} · 命中：{words}',
      'deep.m3NoWords': '无',
      'deep.m4Detail': '正向信号 {ps} 个 · 平衡信号 {bs} 个',
      'deep.m5Detail': '平均等级 {avg} · 最低 {worst} · L1 占比 {pct}%',
      'deep.specificity': '具体度：{value}',
      'deep.btnNeedsModel': '需配置外部模型后启用',
      'deep.btnNeedsAnalysis': '请先运行基础分析',
      'deep.btnReady': '运行 M3/M4/M5 深度分析',

      // card collapse buttons
      'card.collapse': '折叠',
      'card.expand': '展开',

      // msg — dynamic messages
      'msg.v2Done': 'v2 多层分析完成（{mode}模式，{stages}）',
      'msg.creating': '正在创建分析任务。',
      'msg.switchedFallback': '任务状态丢失，已切换到直连模式',
      'msg.v2Failed': 'v2 分析失败',
      'msg.jobCreateFailed': '分析任务创建失败',
      'msg.jobReadFailed': '分析任务读取失败',
      'msg.jobFailed': '分析任务失败',
      'msg.timeout': '分析耗时过长，已停止等待。你可以稍后重试，或先关闭外部模型增强。',
      'msg.historyReadFailed': '历史记录读取失败',
      'msg.clearFailed': '清空失败',
      'msg.deleteFailed': '删除失败',
      'msg.syncFailed': '同步分析接口调用失败',
      'msg.syncFallback': '分析完成。当前服务使用同步分析接口返回结果。',
      'msg.localFallback': '后端暂不可用，已切换到浏览器本地分析。',
      'msg.localAnalyzing': '正在执行浏览器本地分析。',
      'msg.localDone': '分析完成。当前显示的是浏览器本地分析结果。',
      'msg.historyRestored': '已加载历史结果。',
      'msg.stalled': '{msg} 当前环节耗时偏长，可能卡在外部模型或网络。',
      'msg.progressClassifying': '正在识别语言、文本场景和行业。',
      'msg.progressRuleEngine': '正在运行本地规则引擎。',
      'msg.progressLlm': '正在请求外部模型补充判断。',
      'msg.progressVerification': '正在整理结果并进行自检。',
      'msg.progressTrendGenerating': '正在生成趋势分析...',
      'msg.trendNoResult': '当前没有可用的趋势总结结果。',
      'msg.trendFailed': '趋势分析失败',
      'msg.trendFailedFull': '趋势分析失败。',
      'msg.autoClassifyFailed': '自动识别失败',
      'msg.fileMode': '当前页面是文件模式，正在尝试连接本地服务 {base}',
      'msg.fileModeUnavailable': '当前页面是通过文件方式打开的，必须先启动本地应用服务，然后连接到 {base} 才能调用分析接口。',
      'msg.serviceUnavailable': '当前应用服务不可用，请确认应用已启动。',
      'msg.stalledHint': '如果卡住太久，建议先检查应用服务和外部模型服务状态。',
      'msg.connectionFailed': '后端分析接口没有返回有效结果。',
      'msg.noLlmResult': '当前没有拿到可用的外部模型补充结果。',
      'msg.connectionAbnormal': '连接异常',
      'msg.analysisFailed': '分析失败',

      // timing
      'timing.seconds': '{n} 秒',
      'timing.minutesSeconds': '{m} 分 {s} 秒',
      'timing.zero': '0 秒',

      // client verification messages
      'clientVerif.manualOverride': '当前结果使用了人工覆盖，不依赖自动识别。',
      'clientVerif.lowConfidence': '自动识别置信度偏低（{pct}%），建议人工复核。',
      'clientVerif.okConfidence': '自动识别置信度正常（{pct}%）。',
      'clientVerif.ruleConfidenceLow.title': '本地规则置信度',
      'clientVerif.ruleConfidenceLow.msg': '本地规则对当前文本的把握一般，建议结合原文复核。',
      'clientVerif.ruleConfidenceOk.title': '本地规则置信度',
      'clientVerif.ruleConfidenceOk.msg': '本地规则引擎置信度为 {pct}%。',
      'clientVerif.llmDisabled.title': '外部模型增强',
      'clientVerif.llmDisabled.msg': '当前结果没有拿到外部模型增强，主要依据本地规则生成。',
      'clientVerif.llmError.msg': '外部模型本轮未正常返回：{error}',
      'clientVerif.llmEnabled.title': '外部模型增强',
      'clientVerif.llmEnabled.msg': '已启用 {provider} · {model}。',
      'clientVerif.llmGap.title': '外部模型一致性',
      'clientVerif.llmGap.warnMsg': '外部模型与本地规则分差较大（{gap} 分），建议人工复核。',
      'clientVerif.llmGap.okMsg': '外部模型与本地规则分差可接受（{gap} 分）。',
      'clientVerif.analysisFailedTitle': '分析任务失败',

      // analysis note
      'analysisNote.nonGreen': '当前文本的绿色声明概率只有 {prob}%，低于 {threshold}% 的识别阈值，所以系统返回的是基线低风险分 {risk}%，不是完整 greenwashing 高风险判断。',
      'analysisNote.greenClaim': '当前文本已被识别为绿色声明，系统进入完整风险评分流程，再结合证据、模糊表达、承诺落差和外部模型结果给出最终分数。',
      'analysisNote.default': '分析完成后会显示这次分数是完整风险判断，还是非绿色声明基线分。',

      // v2 result texts
      'v2.summary': 'GRI {gri} · {count} 条声明 · {mode}模式',
      'v2.analysisNote': '综合绿色声明风险指数（GRI）为 {gri}，风险等级{level}。',
      'v2.fastSummary': '已完成 {stages} · {count} 条声明（仅快速模式无评分）',
      'v2.langLine': '语言：{lang}',
      'v2.claimCountLine': '声明：{count} 条',
      'v2.layerLine': '层级：{stages}',
      'v2.sinEvidence': '{count} 条证据',

      // llm panel dynamic
      'llm.callFailed': '{provider} 调用失败：{error}',
      'llm.callFailedSummary': '{provider} 调用失败',
      'llm.notEnabledMsg': '外部模型未启用：{summary}',

      // label misc
      'label.noResults': '暂无结果',
      'label.pending': '待开始',
      'label.generalScene': '通用场景',
    },

    en: {
      // topbar
      'topbar.title': 'Green Claims Risk Detection',
      'topbar.ariaLabel': 'App header',
      'topbar.collapseAll': 'Collapse All',
      'topbar.expandAll': 'Expand All',
      'topbar.settings': 'Settings',
      'topbar.toggleDark': 'Toggle dark mode',
      'topbar.engineStarting': 'Starting…',

      // build info bar
      'buildInfo.checking': 'Checking version…',
      'buildInfo.view': 'View',

      // workspace / input panel labels
      'workspace.ariaLabel': 'Detection workspace',
      'input.cardTitle': 'Input',

      // guide
      'guide.startLabel': 'Get started',
      'guide.heading': 'Upload PDF or paste text',
      'guide.stepsLabel': 'Steps',
      'guide.step1': '1 Add content',
      'guide.step2': '2 Auto-detect',
      'guide.step3': '3 Start analysis',

      // classification / field labels
      'field.smartRecognition': 'Smart detect',
      'field.classificationStatusDefault': 'Context and sector will be detected automatically after you add content',
      'field.contextType': 'Context type',
      'field.sector': 'Sector',
      'field.contextAuto': 'Smart detect',
      'field.contextMarketing': 'Marketing copy',
      'field.contextProduct': 'Product description',
      'field.contextReport': 'ESG/CSR Report',
      'field.contextSocial': 'Social media',
      'field.contextPressRelease': 'Press release / PR',
      'field.contextInvestorRelations': 'Investor relations',
      'field.contextPolicy': 'Policy / Regulation',
      'field.contextEmployerBranding': 'Employer branding',
      'field.sectorAuto': 'Smart detect',
      'field.sectorGeneral': 'General',
      'field.sectorEnergy': 'Energy / Chemicals',
      'field.sectorFashion': 'Fashion / Retail',
      'field.sectorAviation': 'Aviation / Logistics',
      'field.sectorManufacturing': 'Manufacturing',
      'field.sectorFinance': 'Finance',
      'field.sectorTechnology': 'Technology',
      'field.sectorFoodAgriculture': 'Food / Agriculture',
      'field.sectorConstructionRealestate': 'Construction / Real estate',
      'field.sectorAutomotive': 'Automotive / Transport',
      'field.sectorConsumerGoods': 'Consumer goods / FMCG',
      'field.sectorHealthcare': 'Pharma / Healthcare',

      // analysis mode
      'field.modeAuto': 'Auto',
      'field.modeFast': 'Fast (keyword)',
      'field.modeStandard': 'Standard (+LLM structured)',
      'field.modeComprehensive': 'Comprehensive (+cert+sins+GRI)',
      'field.modeDepth': 'Analysis depth',

      // pdf upload
      'pdf.ariaLabel': 'Upload PDF file',
      'pdf.kicker': 'PDF file',
      'pdf.label': 'Drag here, or ',
      'pdf.labelLink': 'click to select',
      'pdf.hint': 'Context and sector will be auto-detected after extraction',
      'pdf.claimTextLabel': 'Text to analyze',
      'pdf.placeholder': 'Paste a green, eco-friendly, low-carbon, ESG or sustainability-related statement',

      // buttons
      'btn.startAnalysis': 'Start analysis',
      'btn.analyzing': 'Analyzing…',
      'btn.sample': 'Sample',
      'btn.clear': 'Clear',
      'btn.exportJson': 'Export JSON',
      'btn.deepAnalyze': 'Deep analysis',
      'btn.deepAnalyzeInfo': 'M3/M4/M5 deep analysis (vagueness, framing strength, commitment-action gap), outputs TGRI composite risk index.',
      'btn.collapseAll': 'Collapse all',
      'btn.expandAll': 'Expand all',
      'btn.copyRewrite': 'Copy rewrite',
      'btn.copied': 'Copied',
      'btn.trendAnalysis': 'Trend analysis',
      'btn.clearHistory': 'Clear history',

      // result panel
      'result.cardTitle': 'Detection result',
      'result.ariaLabel': 'Detection result',

      // welcome panel
      'welcome.title': 'Waiting for analysis',
      'welcome.desc': 'After adding content, context and sector will be identified on the left; once you click "Start analysis", risk scores, evidence gaps and detailed diagnostics will appear here.',
      'welcome.tryButton': 'Try sample text',

      // score panel
      'score.riskLabel': 'Pending',
      'score.summaryDefault': 'Enter text to start analysis.',
      'score.riskProbLabel': 'Greenwashing risk probability',
      'score.langPending': 'Language: pending',
      'score.scenePending': 'Context: pending',
      'score.industryPending': 'Sector: pending',
      'score.claimProbLabel': 'Green claim probability',
      'score.confidenceLabel': 'Confidence',
      'score.analysisNoteDefault': 'After analysis, this will show whether the score is a full risk assessment or a non-green-claim baseline.',

      // progress panel
      'progress.ariaLabel': 'Analysis progress',
      'progress.heading': 'Analysis progress',
      'progress.idle': 'Enter text to start analysis.',
      'progress.labelIdle': 'Pending',
      'progress.labelCreating': 'Creating job',
      'progress.labelQueued': 'Queued',
      'progress.labelRunning': 'Analyzing',
      'progress.labelCompleted': 'Completed',
      'progress.labelFailed': 'Failed',
      'progress.labelStalled': 'Taking longer',
      'progress.labelDefault': 'Analyzing',

      // tabs
      'tab.overview': 'Overview',
      'tab.details': 'Details',
      'tab.advanced': 'Advanced',
      'tab.ariaLabel': 'Analysis result views',

      // breakdown
      'breakdown.vagueness': 'Vagueness',
      'breakdown.evidence': 'Evidence gap',
      'breakdown.overclaim': 'Overclaim',
      'breakdown.promise': 'Commitment gap',

      // evidence strip
      'evidence.quantified': 'Quantified',
      'evidence.timeline': 'Timeline',
      'evidence.proof': 'External proof',
      'evidence.action': 'Action evidence',
      'evidence.scope': 'Scope / baseline',

      // v2 overview
      'v2.mainRisks': 'Top risk areas',
      'v2.claimsLabel': 'Per-claim analysis (',
      'v2.consistencyLabel': 'Consistency analysis',

      // v2 sins
      'v2.sin.hiddenTradeoff': 'Hidden tradeoff',
      'v2.sin.noProof': 'No proof',
      'v2.sin.vagueness': 'Vagueness',
      'v2.sin.falseLabels': 'False labels',
      'v2.sin.irrelevance': 'Irrelevance',
      'v2.sin.lesserOfEvils': 'Lesser of evils',
      'v2.sin.fibbing': 'Fibbing',

      // v2 claim structure
      'v2.structuredDetails': 'Structured details',
      'v2.noStructuredData': 'No structured data',
      'v2.contradiction': 'Contradiction',

      // findings
      'findings.cardTitle': 'Risk factors & matched signals',
      'findings.riskFactors': 'Risk factors',
      'findings.matchedSignals': 'Matched signals',
      'findings.noResults': 'No results',

      // llm panel
      'llm.cardTitle': 'LLM enhanced judgment',
      'llm.noApiConfig': 'No external model API configured. Using local rule engine.',
      'llm.noResults': 'No external model results available',
      'llm.noConfig': 'No external model configured',
      'llm.notEnabled': 'External model not enabled',
      'llm.vagueTitle': 'Vagueness diagnostics & rewrite suggestions',
      'llm.contradictionTitle': 'Logical contradiction detection',
      'llm.credibilityTitle': 'Claim credibility assessment',
      'llm.rewriteTitle': 'Compliant rewrite suggestions',

      // emotion panel
      'emotion.cardTitle': 'Three-layer emotion detection',
      'emotion.pendingDefault': 'Pending analysis.',
      'emotion.warning': 'Large divergence across three layers — manual review recommended.',
      'emotion.ruleLayer': 'Rule layer',
      'emotion.nlpLayer': 'NLP layer',
      'emotion.llmLayer': 'LLM layer',
      'emotion.offline': 'Offline',
      'emotion.level.none': 'No obvious risk',
      'emotion.level.low': 'Low',
      'emotion.level.medium': 'Medium',
      'emotion.level.high': 'High',
      'emotion.explain.none': 'No obvious emotional manipulation detected. Text tone is relatively neutral and objective.',
      'emotion.explain.low': 'Text has a mild positive emotional tone, within normal brand communication range.',
      'emotion.explain.medium': 'Text uses some emotional appeal strategies that may attempt to influence judgment through emotional cues. Review specific wording recommended.',
      'emotion.explain.high': 'Text shows significant emotional manipulation, using highly charged expressions extensively, which may constitute misleading framing.',
      'emotion.explainPending': 'After analysis, this will explain the emotional tone of the text in plain language.',
      'emotion.consistencyLabel': 'Consistency: {pct}%',
      'emotion.consistencyPending': 'Consistency: pending',
      'emotion.consistencyAnalyzing': 'Consistency: analyzing',
      'emotion.layersLabel': 'Layers used: {n}',
      'emotion.layersAnalyzing': 'Layers used: analyzing',
      'emotion.summaryPending': 'Pending',
      'emotion.summaryHigh': 'Emotion risk: high · {score} · review recommended',
      'emotion.summaryMedium': 'Emotion risk: medium · {score}',
      'emotion.summaryLow': 'Emotion risk: low · {score}',
      'emotion.nlpNotParticipated': 'NLP layer not active this round',
      'emotion.nlpOffline': 'NLP service offline',

      // verification panel
      'verification.cardTitle': 'Result self-check',
      'verification.ariaLabel': 'Result self-check',
      'verification.pendingDesc': 'After analysis, automatic detection and external model self-verification results will appear here.',
      'verification.noResults': 'No verification results',
      'verification.statusPending': 'Pending',
      'verification.overall.pass': 'Automatic detection and external model results are generally trustworthy for this analysis.',
      'verification.overall.warn': 'Some aspects of this analysis require manual attention. Review against the original text recommended.',
      'verification.overall.fail': 'Significant anomalies detected in this analysis. Do not rely on results directly.',
      'verification.overallDone': 'Verification complete.',
      'verification.statusLabel.pass': 'Pass',
      'verification.statusLabel.warn': 'Warn',
      'verification.statusLabel.fail': 'Fail',
      'verification.overallLabel.pass': 'Pass',
      'verification.overallLabel.warn': 'Warn',
      'verification.overallLabel.fail': 'Fail',
      'verification.overallLabel.done': 'Done',
      'verification.summaryCount': '{label} · {n} checks',

      // history panel
      'history.cardTitle': 'Detection history',
      'history.recentLabel': 'Recent analyses',
      'history.ariaLabel': 'Recent analyses',
      'history.noRecords': 'No history yet',
      'history.chartTitle': 'Risk score trend',
      'history.chartAriaLabel': 'Risk score trend chart',
      'history.legendScore': 'Risk score',
      'history.legendAvg': 'Moving avg',
      'history.recentCount': 'Last {n} analyses',
      'history.deleteAriaLabel': 'Delete this history item',
      'history.trendSummaryTitle': 'Requires external model API',
      'history.clearConfirm': 'Are you sure you want to clear all detection history? This cannot be undone.',

      // settings drawer
      'settings.title': 'Settings',
      'settings.close': 'Close',
      'settings.cancel': 'Cancel',
      'settings.saveAndTest': 'Save & test',
      'settings.providerGroup': 'Active provider',
      'settings.providerNone': 'None (local rules)',
      'settings.apiKeyLabel': 'API Key',
      'settings.apiKeyPlaceholder': 'Keep existing / enter new key',
      'settings.modelLabel': 'Model',
      'settings.modelPlaceholder': 'Model name',
      'settings.showHide': 'Show/hide',
      'settings.otherGroup': 'Other',
      'settings.timeoutLabel': 'Request timeout (ms)',
      'settings.unconfigured': 'Not configured',
      'settings.configured': 'Configured',
      'settings.saving': 'Saving...',
      'settings.savedNoProvider': '✓ Saved — no external provider used',
      'settings.savedTesting': 'Saved, testing connection...',
      'settings.savedConnected': '✓ Saved, connected to {provider} successfully',
      'settings.savedTestFailed': '✓ Saved; test failed: {error}',
      'settings.savedTestError': '✓ Saved; test error: {error}',
      'settings.loadFailed': 'Failed to load settings: {error}',
      'settings.saveFailed': 'Failed to save: {error}',

      // status / engine messages
      'status.connected': 'Connected · {version}',
      'status.disconnected': 'Disconnected',
      'status.offline': 'Offline · {version}',
      'status.historyDisabled': ' · History off',
      'status.analyzing': 'Analyzing · {stage} · {pct}%',
      'status.needsExternalModel': 'Requires external model API',

      // stage labels
      'stage.idle': 'Pending',
      'stage.creating': 'Creating job',
      'stage.queued': 'Queued',
      'stage.classifying': 'Auto-detecting',
      'stage.scoring': 'Local rule scoring',
      'stage.nlpLocal': 'NLP emotion model',
      'stage.nlpSkip': 'Skip NLP',
      'stage.llm': 'External model enrichment',
      'stage.ruleEngine': 'Local rule scoring',
      'stage.rulePreview': 'Local result preview',
      'stage.llmEnrichment': 'External model enrichment',
      'stage.verification': 'Self-check',
      'stage.saving': 'Saving record',
      'stage.fallback': 'Switching to direct mode',
      'stage.completed': 'Analysis complete',
      'stage.failed': 'Analysis failed',
      'stage.default': 'Analyzing',

      // classification strip / labels
      'classification.autoHint': 'Context and sector will be detected automatically after you add content',
      'classification.loadingHint': 'Will auto-detect context and sector after you stop typing',
      'classification.manualHint': 'Using current manual context and sector selection',
      'classification.aiIdentified': '{method} detected: {context} · {sector}',
      'classification.errorFallback': 'Auto-detection unavailable; will detect during analysis',
      'classification.langPending': 'Language: pending',
      'classification.scenePending': 'Context: pending',
      'classification.industryPending': 'Sector: pending',
      'classification.langLine': 'Language: {lang}',
      'classification.sceneLine': 'Context: {label} · {source}',
      'classification.industryLine': 'Sector: {label} · {source}',
      'classification.sourceAI': 'AI',
      'classification.sourceManual': 'Manual',
      'classification.sourceKeyword': 'Keyword',
      'classification.pdfLoading': 'PDF extracted, detecting context and sector with AI...',
      'classification.aiLoading': 'Detecting context and sector with AI...',
      'classification.contextSector.context.title': 'Context detection',
      'classification.contextSector.sector.title': 'Sector detection',

      // context type labels
      'context.auto': 'Smart detect',
      'context.marketing': 'Marketing copy',
      'context.product': 'Product description',
      'context.report': 'ESG/CSR Report',
      'context.social': 'Social media',
      'context.press_release': 'Press release / PR',
      'context.investor_relations': 'Investor relations',
      'context.policy': 'Policy / Regulation',
      'context.employer_branding': 'Employer branding',
      'context.general': 'General context',

      // sector labels
      'sector.auto': 'Smart detect',
      'sector.general': 'General',
      'sector.energy': 'Energy / Chemicals',
      'sector.fashion': 'Fashion / Retail',
      'sector.aviation': 'Aviation / Logistics',
      'sector.manufacturing': 'Manufacturing',
      'sector.finance': 'Finance',
      'sector.technology': 'Technology',
      'sector.food_agriculture': 'Food / Agriculture',
      'sector.construction_realestate': 'Construction / Real estate',
      'sector.automotive': 'Automotive / Transport',
      'sector.consumer_goods': 'Consumer goods / FMCG',
      'sector.healthcare': 'Pharma / Healthcare',
      'sector.default': 'General',

      // pdf upload states
      'pdf.errorFormat': 'Please upload a PDF file.',
      'pdf.errorSize': 'File too large. Please upload a PDF under 20MB.',
      'pdf.processing': 'Extracting text...',
      'pdf.extractFailed': 'PDF text extraction failed',
      'pdf.extractError': 'Extraction failed, please try again.',
      'pdf.engineSystem': 'System engine',
      'pdf.engineJs': 'JS engine',
      'pdf.optimized': ' · Long document optimized',
      'pdf.extracted': '{chars} characters extracted · {engine}',

      // doc viewer
      'docviewer.ariaLabel': 'Document viewer',
      'docviewer.title': 'Document viewer',
      'docviewer.close': 'Close',
      'docviewer.pageMarker': 'Page {n}',
      'docviewer.tableLabel': 'Table content',
      'docviewer.pageNumber': '{current} / {total}',

      // deep analysis
      'deep.cardTitle': 'M3/M4/M5 Deep analysis',
      'deep.m3Title': 'M3 Vagueness',
      'deep.m4Title': 'M4 Framing strength',
      'deep.m5Title': 'M5 Commitment-action gap',
      'deep.tgriLabel': 'TGRI Composite risk index',
      'deep.tgriPending': 'Pending',
      'deep.claimsLabel': 'Per-claim analysis (',
      'deep.keyFindings': 'Key findings',
      'deep.recommendations': 'Recommendations',
      'deep.confidenceLabel': 'Confidence: ',
      'deep.noModel': 'No external model enabled',
      'deep.noResults': 'None',
      'deep.noClaims': 'No analyzable claims identified',
      'deep.errorPrefix': 'Deep analysis failed: ',
      'deep.m3Detail': 'Vagueness ratio {ratio} · Matched: {words}',
      'deep.m3NoWords': 'none',
      'deep.m4Detail': '{ps} positive signals · {bs} balance signals',
      'deep.m5Detail': 'Avg level {avg} · Worst {worst} · L1 share {pct}%',
      'deep.specificity': 'Specificity: {value}',
      'deep.btnNeedsModel': 'Configure external model to enable',
      'deep.btnNeedsAnalysis': 'Run basic analysis first',
      'deep.btnReady': 'Run M3/M4/M5 deep analysis',

      // card collapse buttons
      'card.collapse': 'Collapse',
      'card.expand': 'Expand',

      // msg — dynamic messages
      'msg.v2Done': 'v2 multi-layer analysis complete ({mode} mode, {stages})',
      'msg.creating': 'Creating analysis job.',
      'msg.switchedFallback': 'Job state lost, switched to direct mode',
      'msg.v2Failed': 'v2 analysis failed',
      'msg.jobCreateFailed': 'Failed to create analysis job',
      'msg.jobReadFailed': 'Failed to read analysis job',
      'msg.jobFailed': 'Analysis job failed',
      'msg.timeout': 'Analysis timed out. You can retry later or disable external model enrichment.',
      'msg.historyReadFailed': 'Failed to read history',
      'msg.clearFailed': 'Clear failed',
      'msg.deleteFailed': 'Delete failed',
      'msg.syncFailed': 'Sync analysis API call failed',
      'msg.syncFallback': 'Analysis complete. Result returned via sync API.',
      'msg.localFallback': 'Backend unavailable. Switched to browser-local analysis.',
      'msg.localAnalyzing': 'Running browser-local analysis.',
      'msg.localDone': 'Analysis complete. Showing browser-local analysis result.',
      'msg.historyRestored': 'History result loaded.',
      'msg.stalled': '{msg} Current stage is taking longer than expected. May be stuck on external model or network.',
      'msg.progressClassifying': 'Detecting language, context type and sector.',
      'msg.progressRuleEngine': 'Running local rule engine.',
      'msg.progressLlm': 'Requesting external model supplementary judgment.',
      'msg.progressVerification': 'Compiling results and running self-check.',
      'msg.progressTrendGenerating': 'Generating trend analysis...',
      'msg.trendNoResult': 'No trend summary available at this time.',
      'msg.trendFailed': 'Trend analysis failed',
      'msg.trendFailedFull': 'Trend analysis failed.',
      'msg.autoClassifyFailed': 'Auto-detection failed',
      'msg.fileMode': 'Page is in file mode, attempting to connect to local service {base}',
      'msg.fileModeUnavailable': 'This page was opened as a file. You must start the local app service and connect to {base} to use the analysis API.',
      'msg.serviceUnavailable': 'App service is unavailable. Please make sure the app is running.',
      'msg.stalledHint': 'If stuck for too long, check the app service and external model service status.',
      'msg.connectionFailed': 'Backend analysis API did not return a valid result.',
      'msg.noLlmResult': 'No external model result available.',
      'msg.connectionAbnormal': 'Connection error',
      'msg.analysisFailed': 'Analysis failed',

      // timing
      'timing.seconds': '{n}s',
      'timing.minutesSeconds': '{m}m {s}s',
      'timing.zero': '0s',

      // client verification messages
      'clientVerif.manualOverride': 'Manual override applied. Does not rely on auto-detection.',
      'clientVerif.lowConfidence': 'Auto-detection confidence is low ({pct}%). Manual review recommended.',
      'clientVerif.okConfidence': 'Auto-detection confidence is normal ({pct}%).',
      'clientVerif.ruleConfidenceLow.title': 'Local rule confidence',
      'clientVerif.ruleConfidenceLow.msg': 'Local rule engine has moderate confidence for this text. Review against original recommended.',
      'clientVerif.ruleConfidenceOk.title': 'Local rule confidence',
      'clientVerif.ruleConfidenceOk.msg': 'Local rule engine confidence is {pct}%.',
      'clientVerif.llmDisabled.title': 'External model enrichment',
      'clientVerif.llmDisabled.msg': 'No external model enrichment available. Result based primarily on local rules.',
      'clientVerif.llmError.msg': 'External model did not return normally this round: {error}',
      'clientVerif.llmEnabled.title': 'External model enrichment',
      'clientVerif.llmEnabled.msg': 'Enabled {provider} · {model}.',
      'clientVerif.llmGap.title': 'External model consistency',
      'clientVerif.llmGap.warnMsg': 'Large gap between external model and local rules ({gap} pts). Manual review recommended.',
      'clientVerif.llmGap.okMsg': 'Acceptable gap between external model and local rules ({gap} pts).',
      'clientVerif.analysisFailedTitle': 'Analysis job failed',

      // analysis note
      'analysisNote.nonGreen': 'Green claim probability is only {prob}%, below the {threshold}% detection threshold. System returned a baseline low-risk score of {risk}% rather than a full greenwashing risk assessment.',
      'analysisNote.greenClaim': 'Text identified as a green claim. System ran full risk scoring, combining evidence, vague expressions, commitment gaps and external model results to produce a final score.',
      'analysisNote.default': 'After analysis, this will show whether the score is a full risk assessment or a non-green-claim baseline.',

      // v2 result texts
      'v2.summary': 'GRI {gri} · {count} claims · {mode} mode',
      'v2.analysisNote': 'Composite Green Risk Index (GRI) is {gri}, risk level {level}.',
      'v2.fastSummary': 'Completed {stages} · {count} claims (fast mode — no scoring)',
      'v2.langLine': 'Language: {lang}',
      'v2.claimCountLine': 'Claims: {count}',
      'v2.layerLine': 'Layers: {stages}',
      'v2.sinEvidence': '{count} evidence items',

      // llm panel dynamic
      'llm.callFailed': '{provider} call failed: {error}',
      'llm.callFailedSummary': '{provider} call failed',
      'llm.notEnabledMsg': 'External model not enabled: {summary}',

      // label misc
      'label.noResults': 'No results',
      'label.pending': 'Pending',
      'label.generalScene': 'General context',
    },
  };

  let lang = localStorage.getItem('gl-lang') || 'zh';

  function t(key, vars) {
    const d = translations[lang] || translations.zh;
    let s = d[key] ?? translations.zh[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : '{' + k + '}');
    return s;
  }

  function setLang(newLang) {
    if (!translations[newLang]) return;
    lang = newLang;
    localStorage.setItem('gl-lang', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    applyStaticI18n();
    document.dispatchEvent(new CustomEvent('gl:langchange', { detail: { lang } }));
  }

  function getLang() { return lang; }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    // Update lang toggle button
    const btn = document.getElementById('langToggle');
    if (btn) btn.textContent = lang === 'zh' ? 'EN' : '中';
  }

  window.i18n = { t, setLang, getLang, applyStaticI18n };
})();
