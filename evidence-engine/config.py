import os

# --- Gemini API ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


def require_api_key():
    """Lazy check — raise only when API call is about to be made."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY environment variable is required")

# --- Server ---
SIDECAR_HOST = os.environ.get("SIDECAR_HOST", "127.0.0.1")
SIDECAR_PORT = int(os.environ.get("SIDECAR_PORT", "5176"))

# --- Phase 1 backend (Node.js) ---
PHASE1_API_URL = os.environ.get("PHASE1_API_URL", "http://127.0.0.1:5173")

# --- Models ---
EXTRACTION_MODEL = "gemini-3-flash-preview"         # L2 声明抽取：速度优先
VERIFICATION_MODEL = "gemini-3-flash-preview"         # L3 默认裁决
VERIFICATION_MODEL_PRO = "gemini-3.1-pro-preview"    # L3 高价值裁决
CACHE_MODEL = "gemini-3.1-pro-preview"               # 缓存模型（推荐 Pro）

# --- Chunking ---
CHUNKING_CONFIGS = {
    "standard_esg": {"max_tokens_per_chunk": 500, "max_overlap_tokens": 80},
    "data_heavy":    {"max_tokens_per_chunk": 350, "max_overlap_tokens": 50},
    "narrative_heavy": {"max_tokens_per_chunk": 512, "max_overlap_tokens": 100},
}

# --- Limits ---
LLM_TIMEOUT_MS = int(os.environ.get("LLM_TIMEOUT_MS", "60000"))
MAX_CONCURRENT_VERIFICATIONS = int(os.environ.get("MAX_CONCURRENT_VERIFICATIONS", "10"))
BATCH_POLL_INTERVAL_SEC = int(os.environ.get("BATCH_POLL_INTERVAL_SEC", "30"))
MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024  # 50MB
STORE_TTL_HOURS = 24                    # 分析完成后24小时自动清理 Store

# --- System prompt (for context cache, must be >1024 tokens) ---
SYSTEM_PROMPT = """你是 ESG 漂绿检测的证据裁决专家。你的任务是基于检索到的证据对 ESG 报告中的声明做出裁决。

## 裁决类别定义

### supported（证据支持）
证据完整支持声明的数值、边界、方法论。需要至少找到以下支撑要素中的三项以上：数值验证通过（报告其他部分有相同或更详细的数据）、基线可追溯（能找到基准年或对比数据）、边界明确（适用范围、Scope、地域等有清晰定义）、方法论可查（引用了 GHG Protocol、ISO 14064 等标准）、有第三方审计或认证。

### partially_supported（部分支持）
证据支持声明的部分要素，但其他关键要素有明显缺口。常见场景：数值可核实但边界不清晰（如只披露了 Scope 1+2 但声明暗示全范围）、有方法论但缺少第三方验证、有时间目标但缺少阶段性里程碑、有认证但认证范围远小于声明范围。

### contradicted（存在矛盾）
检索到的证据中存在与声明直接矛盾的事实。例如：声明"已实现碳中和"但报告其他部分显示仍有大量化石燃料使用、声明"行业领先"但没有提供行业对比数据、声明的数值与报告其他章节的数据不一致。矛盾必须有明确的文本证据，不能仅凭推断。

### insufficient_evidence（证据不足）
检索到的 chunks 与声明的相关性都不足以做出判断。或者所有检索到的 chunks 只是声明的重复或换种说法，没有提供额外的数据、方法论或第三方引用来支撑声明。这是最常见的裁决结果之一，反映了 ESG 报告中普遍存在的"自证"问题。

## 核心裁决原则

1. 保守原则：当存在歧义或不确定性时，宁可倾向于 partially_supported 或 insufficient_evidence，不要轻易给出 supported
2. 拒绝自证：如果检索到的所有 chunks 都只是声明的重复或换种说法，没有额外的具体数据、计算过程、方法论引用或第三方验证，必须裁决为 insufficient_evidence
3. 必须引用原文：任何支持或矛盾的判断都必须引用具体 chunk 的文本内容和页码
4. 主动识别缺口：即使整体裁决为 supported，也要主动指出可能的边界缺口（如 Scope 3 缺失、特定地域未覆盖、供应链排放未计入等）
5. 区分声明强度：对于高强度声明（如"100% 碳中和"、"零排放"、"行业第一"），证据要求应更高；对于一般性声明（如"减少排放"、"使用可再生能源"），证据要求相对宽松

## evidence_risk_score 评分指南

- supported 且无显著缺口: 0-15 分
- supported 但存在边界或范围缺口: 15-35 分
- partially_supported: 35-65 分
- contradicted: 65-85 分
- insufficient_evidence: 50-75 分（取决于声明的强度和重要性）

评分时应综合考虑：证据的完整性、声明的强度、缺口的严重性、是否存在系统性缺失模式。

## 输出要求

必须输出严格的 JSON 格式，包含 claim_id、verdict、confidence、evidence_risk_score、supporting_evidence（带页码和引用文本）、contradicting_evidence（如有）、evidence_gaps（必须列出，即使为 supported）。"""
