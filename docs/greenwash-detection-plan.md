# Greenwash Lens — 多层级检测模型规划 v1

> 本文是 Greenwash Lens 检测算法的**重构规划**，不是已实现的功能。
> 目标：把当前"关键词匹配 + 算术"的单层规则引擎升级为基于学术/监管框架的多层级模型，
> 在最大化复用现有功能的前提下，规划清晰的数据/训练/集成路径。
>
> 作者：基于 2026-05-16 代码审计 + 学术/监管资料调研
> 状态：**待评审**，等待用户对"决策点"章节的回复后再启动实施

---

## 1 · Greenwashing 的概念与本质

### 1.1 工作定义

**Greenwashing**：在缺乏充分事实依据的前提下，通过语言、视觉或营销手段，让受众误以为某主体（公司、产品、机构）的环境/可持续表现优于实际情况的传播行为。

这个定义有四个关键要素，每一个都对应一类检测难题：

1. **"语言/视觉/营销手段"** — 信号载体多样（文本、图像、标签、Logo）
2. **"误以为"** — 主观感受，需要语义/语用层面的理解，不是字面真假
3. **"优于实际"** — 需要外部参考系（事实、行业基线、生命周期）才能判定
4. **"传播行为"** — 强调动机，比单纯"信息不准确"更严重

### 1.2 学术框架：TerraChoice "Seven Sins of Greenwashing"

TerraChoice (2007/2010) 是被引用最广的分类法。2010 年的研究发现，北美市场 95% 以上的环保声明至少犯了其中一种"罪"。

| # | 罪名 | 中文 | 例子 | 检测难度 |
|---|---|---|---|---|
| 1 | Hidden Trade-off | 隐藏权衡 | "纸张来自可持续森林"——忽略制造能耗 | 高（需生命周期视角）|
| 2 | No Proof | 无证据 | "100% 环保"——无数据/认证支撑 | **低**（可检测）|
| 3 | Vagueness | 模糊 | "环保"、"绿色"无具体定义 | **低**（可检测）|
| 4 | Worshiping False Labels | 伪标签崇拜 | 自造的"绿色认证"标志 | 中（需认证库）|
| 5 | Irrelevance | 不相关 | "无氟利昂"（氟利昂早已禁用）| 高（需时代/法规知识）|
| 6 | Lesser of Two Evils | 两害取其轻 | "节能 SUV"——SUV 本身高排 | 高（需行业基线）|
| 7 | Fibbing | 撒谎 | 虚假宣称已通过 ENERGY STAR 认证 | **极高**（需事实核查）|

### 1.3 监管框架（决定我们的输出口径）

**欧盟 ECGT 指令（强制 2026-09-27 生效）**——已通过、不可逆。核心要求：
- 禁止"环保"、"碳中和"等**未量化的通用声明**（直接对应 Sin #3）
- 禁止基于**碳抵消**声明"碳中和"——必须区分"减排"和"抵消"
- 必须披露**生命周期阶段**和**评估方法学**

**欧盟 Green Claims Directive（2024-03 通过，2025-06 撤回但仍是行业基准）**：
- 所有环境声明必须有**科学证据**和**生命周期评估（LCA）**
- 第三方独立验证
- 每 5 年更新
- 通过 URL/QR 码披露完整证据

**美国 FTC Green Guides** + **英国 CMA Green Claims Code**：与欧盟方向一致，强调"具体、可验证、不误导"。

**这些框架直接告诉我们检测器需要输出什么类型的结论**——不仅是"风险高/低"，而要分维度告诉用户**违反了哪条原则**。

### 1.4 学术 NLP 研究现状（2024–2025）

- **Bingler et al. (ClimateBERT, 2022–)**: 基于 DistilRoBERTa 的 climate-detection / sentiment / specificity / commitments-actions 分类器，已在 Hugging Face 开源
- **MDPI Sustainability (2025)**: NLP 构建"Greenwashing Severity Index"，量化 ESG 自我陈述 vs 外部叙事的差异
- **印度企业研究 (Shankar & Xu, 2025)**: BERT 微调，92% 准确率分类"绿漂句"——但仅在该数据集上
- **EPJ Data Science (2025)**: MacBERT 中文 ESG 绿漂指数
- **arXiv 2502.07541 (Corporate Greenwashing Detection Survey, 2025)**: **明确指出："目前没有公开的 greenwashing 正负样本数据集，无法直接训练或评估"**——这是整个领域的瓶颈

**关键洞察**：业界共识是必须组合多个**可独立训练/评估**的子任务（specificity、commitment、evidence verification），而不是端到端的"greenwashing 分类器"。

---

## 2 · 当前系统的能力与缺口

### 2.1 已具备的能力（按学术/监管框架对位）

| Sin / 监管要求 | 当前覆盖 | 在哪 |
|---|---|---|
| Vagueness | ✅ 全（中英词典 + ClimateBERT specificity） | `engine-core.js` + `nlp-service/main.py` |
| No Proof | ⚠️ 部分（"是否提到认证/审计"二值标志） | `engine-core.js:122-147` |
| Hidden Trade-off | ⚠️ 部分（scope 标志） | `engine-core.js` evidence.scope |
| Worshiping False Labels | ❌ 无 | — |
| Irrelevance | ❌ 无 | — |
| Lesser of Two Evils | ⚠️ 部分（sector 修正项 +5） | `engine-core.js` highImpactSectors |
| Fibbing | ⚠️ 部分（`evidence-engine` L3 裁定） | `/tmp/greenwash-extracted/evidence-engine/l3_verifier.py`（**尚未合入 worktree**）|
| 量化要求 | ✅（regex）| `engine-core.js:494-504` |
| 生命周期 | ❌ 无 | — |
| 第三方验证 | ⚠️ 部分（关键词命中）| `engine-core.js` proof terms |
| 碳抵消 vs 减排区分 | ❌ 无 | — |

### 2.2 已具备的工程能力（可直接复用）

- **Gemini File Search L1→L4 流水线**（在 `evidence-engine/` Python sidecar）：PDF 索引、声明抽取、证据多查询检索、裁定—这是整个未来架构的"L4 证据核查层"现成模块
- **deep-analysis-service.js (M3/M4/M5/TGRI)**：模糊度 / 包装度 / 承诺-行动落差三维评分 + 文本风险综合指数
- **ClimateBERT NLP sidecar**：specificity、sentiment、commitment 分类器
- **LLM 抽象层 + 缓存**：4 个 provider 适配 + SHA256 缓存
- **SQLite 历史库**：完整保存 request/result/llm/verification —**可改造为带反馈的标注数据源**

### 2.3 关键缺口

1. **没有"原子声明"概念** — 当前把整段文本作为一个评分单位。`evidence-engine` 内部有 `claim_id` 但还没贯穿前端
2. **没有外部知识** — 认证真实性、行业基线、企业历史数据全部缺失
3. **没有反馈闭环** — 历史库存了一切，但没有"对/错"标签字段
4. **L4 流水线未集成** — Python `evidence-engine` 跟前端是两套系统
5. **没有跨段一致性** — P1 说"零排放"+ P5 说"减排 5%"的矛盾，目前完全检测不到（LLM contradictions 不可靠）
6. **没有图像/标签 OCR** — 伪造的认证 Logo、误导性的绿色色调完全在感知盲区

---

## 3 · 多层级评测模型设计

### 3.1 总体架构

```
                            ┌──────────────────────────────────────┐
   PDF / 文本 / 图像  ───▶  │  Layer 0  预处理 + 原子化            │
                            │  language / context / atomic claims  │
                            └──────────────────────────────────────┘
                                            │ List<Claim>
                            ┌───────────────┴────────────────┐
                            ▼                                 ▼
              ┌─────────────────────┐         ┌─────────────────────────┐
              │ Layer 1  规则信号   │  并行   │ Layer 2  语言学分类     │
              │ keyword + regex     │ ◀────▶ │ ClimateBERT specificity │
              │ <100ms / claim      │         │ commitment / sentiment   │
              └─────────────────────┘         └─────────────────────────┘
                            │                                 │
                            └──────────────┬──────────────────┘
                                           ▼
                            ┌──────────────────────────────────────┐
                            │  Layer 3  结构化声明图（LLM）        │
                            │  claim type / scope / baseline /     │
                            │  metric / source / time horizon      │
                            └──────────────────────────────────────┘
                                           │ Structured Claim
                            ┌──────────────┴──────────────────────┐
                            ▼                                       ▼
            ┌────────────────────────────┐    ┌──────────────────────────────────┐
            │ Layer 4  文档内证据核查    │    │ Layer 5  外部参考核查（新）      │
            │ Gemini File Search L1–L4   │    │ 认证库 / 行业基线 / 企业历史     │
            │ (复用 evidence-engine)     │    │                                  │
            └────────────────────────────┘    └──────────────────────────────────┘
                            │                                 │
                            └──────────────┬──────────────────┘
                                           ▼
                            ┌──────────────────────────────────────┐
                            │  Layer 6  跨声明一致性 + Sin 分类   │
                            │  contradictions / 7 Sins mapping     │
                            └──────────────────────────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────────────────┐
                            │  Layer 7  综合评分 + 可解释报告      │
                            │  GRI (Greenwash Risk Index) +        │
                            │  per-Sin breakdown + 校准置信度      │
                            └──────────────────────────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────────────────┐
                            │  Layer 8  反馈闭环 + 主动学习       │
                            │  user feedback → label store →       │
                            │  Layer 2 / 5 / 6 model retraining    │
                            └──────────────────────────────────────┘
```

### 3.2 各层详细规格

---

#### **Layer 0 — 预处理与原子化**

**职责**：把异构输入变成"原子声明"列表。

| 项 | 规格 |
|---|---|
| 输入 | PDF / 文本 / 图像 |
| 输出 | `[{ claim_id, text, page, paragraph, language, modality }]` |
| 复用 | `pdf-extractor.js`, `pdf-cleaner.js`, `text-classifier.js`, classification-constants |
| 新增 | (1) 段落级**原子声明切分**（用 LLM 把长段拆成"一个可独立判真伪"的声明）；(2) 图像 OCR（Tesseract for 文本，CLIP for 视觉品牌元素） |
| 数据需求 | 无（M0），后续可微调切分模型（M3+）|
| 估计工作量 | 切分 1 周（含 prompt 优化）；OCR 1 周；图像 2 周 |

**关键决策**：原子化粒度。建议**段落级**（不是句级）—太细会丢上下文，太粗 evidence 无法对齐。

---

#### **Layer 1 — 规则信号层（重写当前 engine-core.js）**

**职责**：超快速 (<100ms/claim) 提取低层特征向量，作为后续层的输入特征。

| 项 | 规格 |
|---|---|
| 输入 | 单个 Claim |
| 输出 | `FeatureVector { vague_count, absolute_count, proof_count, future_count, emotional_count, action_count, quantified, timeline, units_set, sectors_mentioned, scope_mentions, offset_mentions }` |
| 复用 | 现有 6 个词典 + regex（封装成纯函数）|
| 改造 | (1) 词典扩充：加入**碳抵消词** (offset, neutralize, removal credits)、**生命周期词** (cradle-to-grave, LCA, Scope 1/2/3)、**伪标签触发词** (self-certified, our own standard)；(2) 输出**特征向量**而非分数 |
| 数据需求 | 无；可选：用历史样本统计每个词的"区分度"做剪枝 |
| 估计工作量 | 0.5 周（主要是重构 + 词典扩充） |

**关键决策**：词典维护方式。建议 YAML 文件（按 Sin 分类），让非工程师也能编辑。

---

#### **Layer 2 — 语言学分类层（ClimateBERT 扩展）**

**职责**：句/段级的细粒度语言学标签——specificity, commitment, climate-relatedness, sentiment。

| 项 | 规格 |
|---|---|
| 输入 | 单个 Claim 文本 |
| 输出 | `{ is_climate_related: bool, specificity: 0-1, commitment_or_action: enum, sentiment: enum }` |
| 复用 | 现有 `nlp-service` 已加载 ClimateBERT 4 个模型 |
| 改造 | (1) 接入 `climate_detection` 模型；(2) 把输出从 `emotionScore` 单一字段扩展为完整 4 维向量；(3) 中文路径走 `hfl/chinese-roberta-wwm-ext` 嵌入 + 后续微调 |
| 数据需求 | **M3 之后**：中文 ESG 句子的 specificity / commitment 标注集（800-1500 句即可微调）|
| 估计工作量 | 0.5 周（接入）+ 中文模型 2 周（含数据准备文档）|

**关键决策**：是否引入 ClimateBERT-NetZero（专门检测"净零承诺"质量）。建议**引入**——直接对应 EU ECGT 监管口径。

---

#### **Layer 3 — 结构化声明图（LLM）**

**职责**：把每个声明解析成机器可推理的结构。这是从"文本"到"事实图"的桥梁。

| 项 | 规格 |
|---|---|
| 输入 | Claim 文本 + Layer 1/2 特征 |
| 输出 | `StructuredClaim {`<br/>`  claim_type: vision\|process\|performance\|commitment\|disclosure,`<br/>`  metric: { name, value, unit }?,`<br/>`  scope: { boundary: product\|corporate\|value_chain, ghg_scope: [1,2,3]? },`<br/>`  baseline: { type: absolute\|relative, reference_year, reference_value }?,`<br/>`  time_horizon: { start_year, target_year }?,`<br/>`  evidence_cited: [{ type: certification\|report\|audit\|methodology, name, identifier }?]`<br/>`}` |
| 复用 | `llm-service.js` 抽象 + `llm-cache.js` |
| 改造 | 写一个新的 `extractStructuredClaim` 任务（独立 prompt + JSON schema）|
| 数据需求 | M2：50-100 个标注样本做 few-shot 校准 |
| 估计工作量 | 1 周（prompt + schema + 单测）|

**关键决策**：用结构化输出协议（Pydantic / JSON Schema 严格模式）。Gemini 2.5/Claude 4.5 都支持，可保证一致性。

---

#### **Layer 4 — 文档内证据核查（复用 evidence-engine）**

**职责**：对每个声明在源文档中找证据，判定 supported / partial / contradicted / insufficient。

| 项 | 规格 |
|---|---|
| 输入 | StructuredClaim + 已索引的文档 store |
| 输出 | `ClaimVerdict { verdict, confidence, evidence_quotes, evidence_gaps }` |
| 复用 | **几乎全部复用** `evidence-engine` 的 L1 (索引) / L2 (抽取) / L3 (核查) / L4 (聚合) |
| 改造 | (1) 接到 Node 主进程：增加 `/api/v1/evidence/verify-claim` 路由代理到 Python sidecar；(2) 把 evidence-engine 加入 git（去 .venv / __pycache__）；(3) 修复 electron/main.js 中的 spawn 逻辑（已存在但未测）|
| 数据需求 | 无（基础设施可用）|
| 估计工作量 | 集成 1 周 + Python 测试 1 周 |

**关键决策**：是否在 Gemini File Search 之外也支持本地 RAG（embedding + Qdrant/Chroma）。建议**先只用 Gemini**，等用量/成本压力出现再加。

---

#### **Layer 5 — 外部参考核查（新建，分阶段）**

**职责**：对照外部"事实库"验证声明。

划分成 3 个子层，按数据可获取性排优先级：

**Layer 5a — 认证有效性（M1）**
- 维护**认证库**：ISO 14001 / 14064 / 14067 / GRI / SBTi / CDP / B Corp / RSPO ... + 颁发机构 + 命名规则
- 实现：YAML/JSON 文件 → 启动时加载到 in-memory map
- 检测：声明里出现"X 认证"，查库验证存在性、命名格式是否正确；可识别"自我认证"（伪标签）
- 数据需求：30-50 个主流认证种子（**用户提供**或我从公开资料整理）

**Layer 5b — 行业基线（M2，待数据集）**
- 维护**行业-年份-指标-百分位**表：`{sector: energy, year: 2024, metric: scope1_intensity, p25: ..., p50: ..., p75: ...}`
- 检测：声明"减排 20%"——查该行业当年平均减排率，定位百分位
- 数据需求：**核心数据缺口**。可来源：CDP 公开数据集、Refinitiv ESG、MSCI、欧盟 ETS 数据
- 实现：先建数据 schema 和查询 API，留接口等数据补齐

**Layer 5c — 企业历史一致性（M3）**
- 维护**企业-年份-声明库**：解析过的同企业历史报告
- 检测：今年说"领先行业"——历史报告里说过吗？数据有没有自相矛盾？
- 数据需求：随着系统使用自动积累；可初始化 5-10 家头部企业的历史报告

**估计工作量**：5a 1 周（含种子库）；5b 框架 1 周 + 等数据；5c 数据库设计 1 周 + 等用量

**关键决策**：5b 是这套系统能否做到"真有效"的**核心**。没有行业基线，任何"减排 X%"的声明都只能在文本层评分。

---

#### **Layer 6 — 跨声明一致性 + Seven Sins 分类**

**职责**：在所有声明都被结构化和核查后，做文档级推理。

| 项 | 规格 |
|---|---|
| 输入 | `List<StructuredClaim + Verdict>` |
| 输出 | `{`<br/>`  contradictions: [{ claim_a_id, claim_b_id, type, severity }],`<br/>`  sins: [{ sin_type: hidden_tradeoff\|no_proof\|vagueness\|false_labels\|irrelevance\|lesser_evils\|fibbing, evidence: [claim_ids], severity }]`<br/>`}` |
| 复用 | LLM service + Layer 1/4/5 输出做特征 |
| 实现 | 矛盾检测：(1) 数值矛盾——同一指标不同值（确定性，规则即可）；(2) 范围矛盾——"零排放" vs "Scope 1 = X"；(3) 时间矛盾——目标年份冲突。Sin 分类：每个 Sin 一组规则 + LLM 投票 |
| 数据需求 | M3：50-100 个带 Sin 标签的文档样本做规则校准 |
| 估计工作量 | 1.5 周 |

---

#### **Layer 7 — 综合评分 + 可解释报告**

**职责**：聚合所有层输出 → 一个综合 GRI（Greenwash Risk Index）+ 可读报告。

| 项 | 规格 |
|---|---|
| 输入 | 所有上层输出 |
| 输出 | `{ GRI: 0-100, per_sin_scores: {...}, calibrated_confidence: 0-1, narrative_findings: [...] }` |
| 综合公式（v1，待校准）| `GRI = 0.25 * text_risk (Layer 1+2+3) + 0.40 * evidence_risk (Layer 4) + 0.20 * external_risk (Layer 5) + 0.15 * consistency_risk (Layer 6)` |
| 实现 | 加权聚合 + LLM 生成中文叙述（"主要风险点 / 关键证据缺口 / 建议核查清单"）|
| 数据需求 | M4：标注的 100-200 文档做权重学习 + 校准 |
| 估计工作量 | 1 周（公式）+ 持续校准 |

**关键决策**：是端到端学习权重，还是固定权重 + 人工调？建议**先固定 + 解释**，标注数据足够后再用 isotonic regression 校准。

---

#### **Layer 8 — 反馈闭环 + 主动学习**

**职责**：把人工反馈转成训练信号，闭环改进 Layer 2/5/6。

| 项 | 规格 |
|---|---|
| 改造 | (1) `history-store.js` schema 增加：`user_feedback: { claim_id, sin_type, correct: bool, correct_label: string?, note: string?, reviewer: string, reviewed_at }`；(2) UI 在每个 finding 旁加"👍/👎/编辑"按钮 |
| 数据导出 | 周期性导出 JSONL 训练集：(claim_text, layer_outputs, ground_truth) |
| 主动学习策略 | 优先让人工标"低置信度 + 高 GRI"样本（最有信息量） |
| 数据需求 | 用户日常使用产生 |
| 估计工作量 | UI 改造 0.5 周 + schema 迁移 0.5 周 + 导出脚本 0.5 周 |

---

### 3.3 性能 / 成本预算

| 层 | 延迟（单文档）| 单次成本 | 必要 LLM |
|---|---|---|---|
| L0 | 1-3s（PDF + 切分）| ~0.01 美元 | 切分用 1 次 |
| L1 | < 0.1s/claim | $0 | 无 |
| L2 | 0.5s/claim | $0（本地 BERT）| 无 |
| L3 | 1-2s/claim | ~0.005 美元/claim | 1 次 |
| L4 | 5-15s/claim | ~0.03 美元/claim | 多次（多查询）|
| L5 | < 0.1s（5a）/ < 0.5s（5b/5c）| $0 | 无 |
| L6 | 3-5s/document | ~0.02 美元 | 1-2 次 |
| L7 | 1-2s/document | ~0.005 美元 | 1 次 |

**典型 30 页 ESG 报告（约 20 个原子声明）单次完整分析**：
- 时长：60-180 秒
- 成本（Gemini 2.5 Flash 价位）：~0.7-1.2 美元
- **不再是 1 秒返回，因为不再是假的**

**前端体验**：流式进度——L0 完成立刻显示声明列表；L1/L2 边算边填特征；L4 每个声明独立异步，完成一个亮一个。

---

## 4 · 现有代码 → 新层映射

| 现有文件 | 在新架构中的角色 |
|---|---|
| `src/engine-core.js` | 拆为：词典（YAML 化）+ `Layer1Features()` 纯函数；移除"算分"逻辑 |
| `src/text-classifier.js` | Layer 0 文档分类（保留）|
| `src/services/llm-service.js` | 保留为 LLM 抽象层；新增 4 个任务：`extractAtomicClaims`、`extractStructuredClaim`、`classifyContradictions`、`classifySins` |
| `src/services/deep-analysis-service.js` (M3/M4/M5/TGRI) | 拆为 Layer 1/2 特征 + Layer 7 子分数；M3=Layer1+2 specificity；M4=Layer1+6 framing；M5=Layer3 commitment_type + Layer4 verdict |
| `src/services/emotion-fusion.js` | 并入 Layer 2 输出的一个字段；Rule/NLP/LLM 三层融合保留 |
| `src/services/llm-cache.js` | 保留，扩展为每层独立缓存 |
| `src/services/settings-service.js` | 保留 + 新增"启用层级"开关（让用户能跳过 L4/L5 节省成本）|
| `src/services/nlp-service-client.js` | 保留，接入扩展后的 NLP API |
| `nlp-service/main.py` | Layer 2 模型容器；增加 `climate_detection`、可选 fine-tuned 中文模型加载 |
| `evidence-engine/` (Python sidecar) | **整套作为 Layer 4**；先合入 git，去 .venv/__pycache__ |
| `src/verification-service.js` | 重命名为 `confidence-audit.js`；功能保留，作为最终报告附件 |
| `src/history-store.js` | 扩展 schema 支持 Layer 8 反馈字段 |

**新增模块**：
- `src/layers/L0-preprocess.js`
- `src/layers/L1-features.js`
- `src/layers/L3-structurer.js`（LLM 包装）
- `src/layers/L5a-certification.js` + `data/certifications.yaml`
- `src/layers/L5b-sector-baseline.js` + `data/sector-baselines.sqlite`
- `src/layers/L5c-company-history.js`
- `src/layers/L6-consistency.js`
- `src/layers/L7-aggregate.js`
- `src/layers/L8-feedback.js`

---

## 5 · 数据需求清单（用户后续提供）

按优先级排序。**每个数据集都附 schema 和最小可用样本量。**

### 5.1 [M1, 优先] 认证种子库（30-50 条）

**Schema**:
```yaml
- id: iso_14064
  name: { zh: "ISO 14064 温室气体核算", en: "ISO 14064 GHG Accounting" }
  authority: "International Organization for Standardization"
  domain: ["ghg", "carbon"]
  identifier_pattern: "ISO\\s*14064(-[123])?"
  verification_url: "https://www.iso.org/standard/66453.html"
  type: "process"  # process | product | management_system
  region: "global"
- ...
```

**来源**：我可以从公开资料整理初版，用户审阅。

### 5.2 [M2, 关键] 行业基线数据（每行业 ≥ 50 家企业 × 5 年 × 10 指标）

**Schema**:
```sql
CREATE TABLE sector_baseline (
  sector TEXT,
  metric TEXT,        -- scope1_intensity, scope2_intensity, renewable_pct, etc.
  year INT,
  region TEXT,
  p10 REAL, p25 REAL, p50 REAL, p75 REAL, p90 REAL,
  source TEXT,
  PRIMARY KEY (sector, metric, year, region)
);
```

**来源**（用户决策）：CDP Open Data Portal / 欧盟 EU ETS / 行业协会报告 / 付费 Refinitiv & MSCI。建议先从 CDP（免费）入手。

### 5.3 [M3, ML 训练用] 中文 ESG 声明标注集（≥ 1500 句）

**Schema**:
```jsonl
{"text": "2024 年我们 Scope 1 排放下降 12%，覆盖全球 23 个生产基地", "specificity": "high", "commitment_type": "achievement", "is_climate_related": true}
{"text": "致力于建设绿色低碳的美好未来", "specificity": "low", "commitment_type": "vision", "is_climate_related": true}
```

**用途**：微调 Layer 2 的中文 specificity / commitment 分类器（基于 `hfl/chinese-roberta-wwm-ext`）

**标注成本估计**：1500 句 × 1 分钟 ≈ 25 小时；建议 2 人交叉标注计算 Cohen's kappa

### 5.4 [M3, 评估用] 端到端 Greenwash 标注文档集（30-100 篇）

**Schema**:
```jsonl
{
  "doc_id": "marks_spencer_2025",
  "pdf_url": "...",
  "ground_truth": {
    "overall_severity": "medium",
    "sins": [
      { "type": "vagueness", "severity": "high", "evidence_pages": [12, 14] },
      { "type": "no_proof", "severity": "medium", "evidence_pages": [22] }
    ]
  },
  "annotator": "...",
  "annotated_at": "..."
}
```

**用途**：评估整套系统的端到端准确性；校准 Layer 7 权重

**来源**：建议从用户已有的研究案例 + 监管机构公开判例（如英国 ASA Ruling、SEC 警告函）

### 5.5 [M4, 增强用] 同公司历史报告（5-10 家企业 × 3-5 年）

**用途**：填充 Layer 5c

**来源**：公开年报，可由系统自动抓取入库

---

## 6 · 实施路线图

> 单位：人周；假设 1 人全职；并行任务用 `||` 标注

### 阶段 0：清理 + 集成现有功能（**2 周**）
- [ ] 把 `evidence-engine/` 合入 git（去 `.venv` / `__pycache__` / `.pytest_cache`，加 `requirements.txt` 在 readme）
- [ ] 修通 `electron/main.js` 中 evidence-engine sidecar 的 spawn 逻辑
- [ ] 加 `/api/v1/evidence/*` 路由代理到 Python sidecar
- [ ] 端到端跑通：上传 PDF → Python L1-L4 完整执行 → 前端展示
- [ ] 至此交付：**"重型分析"按钮**——`enrichAnalysis` 之上加 `deepEvidenceVerify`

### 阶段 1：架构重构 + Layer 0/1/3（**3 周**）
- [ ] 把 `src/services/` 重组为 `src/layers/L*.js`
- [ ] `engine-core.js` 拆词典 (YAML) + 特征函数
- [ ] 实现 Layer 0 (原子化 LLM 任务)
- [ ] 实现 Layer 3 (结构化 LLM 任务)
- [ ] 旧 `analyze` API 改为编排各层调用
- [ ] 单测覆盖：每层 ≥ 5 个 fixture

### 阶段 2：Layer 5a 认证库 + Layer 6 一致性（**2 周**）
- [ ] 认证种子库 YAML + 加载器 + API
- [ ] 矛盾检测规则（数值/范围/时间）
- [ ] LLM Seven Sins 分类器
- [ ] UI：findings 按 Sin 分组展示

### 阶段 3：Layer 7 + Layer 8 反馈（**2 周**）
- [ ] GRI 综合公式 + 校准框架
- [ ] history-store.js schema 迁移 (加 user_feedback)
- [ ] UI: 每个 finding 加 👍/👎/编辑按钮
- [ ] 反馈导出脚本

### 阶段 4：Layer 2 中文模型微调（**等数据 + 1 周**）
- [ ] 准备数据集（用户提供 1500 句）
- [ ] 微调脚本 + 评估指标
- [ ] 模型上线（更新 nlp-service）

### 阶段 5：Layer 5b 行业基线（**等数据 + 2 周**）
- [ ] 数据 schema + ETL 脚本（CDP/EU ETS）
- [ ] 基线查询 API
- [ ] 集成到 Layer 6（声明对比基线）

### 阶段 6：扩展（按需）
- 图像/OCR
- 多文档比较
- 企业历史自动抓取
- 实时监管更新订阅

**总工程量（不含等数据）**：约 9-10 人周（阶段 0-3）；含全部约 15-18 人周。

---

## 7 · 决策点（已和用户对齐于 2026-05-16）

| # | 决策点 | 最终决策 |
|---|---|---|
| 1 | 主要 LLM provider | **DeepSeek v4-pro**（成本/中文双优），Layer 4 例外用 Gemini |
| 2 | Layer 4 技术路线 | **方案 A**：留用 Gemini File Search（evidence-engine 现状）；后续方案 B 升级到自建 RAG + DeepSeek 已记录 |
| 3 | 阶段 0 单独 PR | **是**——先把 evidence-engine 合入 git，跑通现有 L1-L4，再启动其余阶段 |
| 4 | 行业基线数据来源 | **CDP Open Data Portal 起步**；不够再升级到付费 |
| 5 | 图像 OCR | 后置（先做文本）|
| 6 | 中文 vs 英文 | 中英双语，报告输出中文 |
| 7 | 完整 L4 默认运行 | 不默认；"快速 / 完整 / 深度"三档让用户选 |
| 8 | 反馈数据共享 | 默认不上传，用户可勾选贡献到匿名训练集 |

### 7.1 方案 B 备忘（Layer 4 自建 RAG 升级路径）

当 Gemini 成本/主权问题出现时，可以按这条路升级：

1. PDF 切分（pypdf/pdfplumber） → 文本块 (chunk size ~500 tokens, overlap 50)
2. Embedding：`BAAI/bge-m3`（多语言，开源，免费本地跑）
3. 向量库：Qdrant（开源，可自托管）或 Chroma（更轻量）
4. 检索：多查询（同 evidence-engine L3 现状）→ top_k 块 → 去重
5. 裁定：DeepSeek 长 context 接收 top_k 块 + claim → 输出 `verdict / confidence / evidence`
6. 替换 `evidence-engine/l1_store.py`（Gemini File Search）为本地索引器；`l2_extractor.py / l3_verifier.py` 切换 LLM endpoint

**工程量估算**：3 周（含模型微调评估）。
**成本对比**：典型 30 页 PDF 完整分析，Gemini File Search ~$1，自建 RAG + DeepSeek 推理 ~$0.10。规模化时省 10×。

---

## 8 · 引用资料

### 学术
- arXiv 2502.07541 — Corporate Greenwashing Detection in Text: A Survey (2025)
- aclanthology 2025.swisstext-1.3 — Detecting Greenwashing Hints in ESG Reports
- aclanthology 2023.emnlp-main.975 — ClimateBERT-NetZero
- MDPI Sustainability 18(3):1486 — NLP-Based Greenwashing Detection (CEE Firms)
- EPJ Data Science (2025) — Corporate Greenwashing Index via MacBERT
- Springer Env Sci Europe — Concepts and Forms of Greenwashing: A Systematic Review

### 监管
- 欧盟 ECGT (Empowering Consumers Directive), Mar 2024，2026-09-27 生效
- 欧盟 Green Claims Directive，March 2024 通过，2025-06 撤回
- US FTC Green Guides
- UK CMA Green Claims Code

### 框架
- TerraChoice Seven Sins of Greenwashing (2007/2010)
- TCFD Recommendations
- GRI Standards
- SBTi (Science Based Targets initiative)

### 模型/数据
- Hugging Face `climatebert/*` 系列数据集与模型
- ClimaText (TCFD-aligned annotated dataset)
- CDP Open Data Portal

---

## 附录 A · 与"7 Sins"对位的检测能力矩阵

| Sin | 当前 | 阶段 0 后 | 阶段 3 后 | 完全实现后 |
|---|---|---|---|---|
| Hidden Trade-off | ❌ | ⚠️ scope flag | ⚠️ + Layer 6 一致性 | ✅ + Layer 5c LCA 数据 |
| No Proof | ⚠️ 词命中 | ✅ + Layer 4 evidence 检索 | ✅ + Layer 5a 认证库 | ✅ |
| Vagueness | ⚠️ 词命中 | ✅ + Layer 2 specificity | ✅ + Layer 7 加权 | ✅ |
| False Labels | ❌ | ❌ | ⚠️ Layer 5a 部分 | ✅ + 标志图像 OCR |
| Irrelevance | ❌ | ❌ | ⚠️ LLM 部分 | ✅ + Layer 5a 时代/法规知识 |
| Lesser Evils | ⚠️ +5 修正 | ⚠️ | ⚠️ | ✅ + Layer 5b 行业基线 |
| Fibbing | ⚠️ L3 if 集成 | ✅ Layer 4 | ✅ + Layer 5 外参 | ✅ + Layer 5c 历史一致性 |
