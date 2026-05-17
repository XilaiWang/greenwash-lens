"""
L3: Evidence verification — query generation, retrieval, adjudication.

For each claim:
  1. Generate 3-5 verification queries
  2. File Search retrieval for each query
  3. Adjudicate evidence → ClaimVerdict

Supports realtime (asyncio parallel) and batch modes.
"""

import asyncio
import logging
from typing import List

from google import genai
from google.genai import types
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import (
    GEMINI_API_KEY,
    VERIFICATION_MODEL,
    VERIFICATION_MODEL_PRO,
    MAX_CONCURRENT_VERIFICATIONS,
    require_api_key,
)
from models import (
    Claim,
    EvidenceQuery,
    SupportingChunk,
    EvidenceGap,
    ClaimVerdict,
    Verdict,
)
from l1_store import retrieve_chunks

logger = logging.getLogger(__name__)

QUERY_GENERATION_PROMPT = """你是漂绿检测的"证据搜索"专家。

【输入】一条从 ESG 报告中抽取的声明。
【任务】生成 3-5 个用于检索该声明相关证据的查询。

验证维度：
1. 数值验证 — 查询声明中具体数字背后的支撑数据
2. 基线验证 — 查询参照点（基准年、上年度、行业均值）
3. 边界验证 — 查询声明的适用范围（哪些实体、Scope、地域）
4. 方法验证 — 查询核算方法、定义、标准引用
5. 可验证性 — 查询第三方审计、认证、外部验证
6. 一致性验证 — 查询相关但可能矛盾的其他数据点

规则：
- 查询使用自然语言
- 不在查询中复述声明本身
- 每个查询是独立的语义检索 query
- 选择最相关的 3-5 个维度

返回 JSON array: [{"query_id":"Q001","query_text":"...","query_purpose":"数值验证"}]"""

ADJUDICATION_PROMPT = """你是漂绿检测的"证据裁决"专家。

【裁决类别】
- supported: 证据完整支持声明的数值、边界、方法论
- partially_supported: 证据支持部分要素，但有缺口
- contradicted: 证据中存在与声明矛盾的事实
- insufficient_evidence: chunks 不足以做出判断

【核心原则】
1. 保守原则：存在歧义时倾向于 partially_supported 或 insufficient_evidence
2. 拒绝自证：chunks 只是声明的重复而无数据/方法支撑 → insufficient_evidence
3. 必须引用：任何支持/矛盾的判断必须指向具体 chunk 和页码
4. 识别缺口：即使 supported 也要识别边界缺口（如 Scope 3）

【evidence_risk_score】
- supported 且无缺口: 0-15
- supported 但有缺口: 15-35
- partially_supported: 35-65
- contradicted: 65-85
- insufficient_evidence: 50-75

返回严格 JSON。"""


_client = None

def _get_client():
    global _client
    if _client is None:
        require_api_key()
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


async def generate_queries(claim: Claim, system_cache_name: str) -> list[EvidenceQuery]:
    """为单条声明生成 3-5 个验证查询。"""
    client = _get_client()

    prompt = f"{QUERY_GENERATION_PROMPT}\n\n声明：{claim.claim_text}"

    config = {
        "thinking_config": {"thinking_level": "low"},
        "response_mime_type": "application/json",
        "temperature": 0.1,
    }
    if system_cache_name and system_cache_name != "__nocache__":
        config["cached_content"] = system_cache_name

    try:
        response = await client.aio.models.generate_content(
            model=VERIFICATION_MODEL,
            contents=prompt,
            config=config,
        )
        raw = response.text
        # Import here to reuse l2_extractor's tiered JSON parser
        from l2_extractor import _robust_parse_json
        qdata = _robust_parse_json(raw) if isinstance(raw, str) else raw
        if isinstance(qdata, list):
            queries = [EvidenceQuery(**q) for q in qdata[:5]]
        else:
            queries = [EvidenceQuery(**q) for q in qdata.get("queries", [])[:5]]
        return queries[:5]
    except Exception as e:
        logger.warning(f"Query generation failed for {claim.claim_id}: {e}")
        # Fallback: single generic query
        return [EvidenceQuery(
            query_id="Q001",
            query_text=claim.claim_text,
            query_purpose="数值验证",
        )]


async def retrieve_for_queries(
    queries: list[EvidenceQuery],
    store_name: str,
    top_k: int = 5,
) -> list[dict]:
    """对多个查询并行执行 File Search 检索。"""
    tasks = [retrieve_chunks(q.query_text, store_name, top_k) for q in queries]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_chunks = []
    for r in results:
        if isinstance(r, list):
            all_chunks.extend(r)
    return all_chunks


def deduplicate_chunks(chunks: list[dict]) -> list[dict]:
    """按文本相似度去重，保留首次出现。"""
    seen = set()
    unique = []
    for c in chunks:
        key = (c.get("text", "")[:120], c.get("page_number"))
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return sorted(unique, key=lambda c: c.get("page_number") or 0)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(Exception),
)
async def adjudicate_evidence(
    claim: Claim,
    chunks: list[dict],
    doc_cache_name: str,
    use_pro: bool = False,
) -> ClaimVerdict:
    """基于检索到的 chunks 做出最终裁决。

    Args:
        claim: 待裁决的声明
        chunks: 去重后的检索结果
        doc_cache_name: 文档级 context cache
        use_pro: 是否使用 Pro 模型（高价值裁决）

    Returns:
        ClaimVerdict: 包含 verdict、confidence、evidence_risk_score、证据 chunks、缺口
    """
    model = VERIFICATION_MODEL_PRO if use_pro else VERIFICATION_MODEL
    client = _get_client()

    if not chunks:
        return ClaimVerdict(
            claim_id=claim.claim_id,
            verdict=Verdict.INSUFFICIENT_EVIDENCE,
            confidence=0.3,
            evidence_risk_score=60.0,
            evidence_gaps=[EvidenceGap(
                gap_type="no_chunks_retrieved",
                description="File Search 未检索到任何相关证据。报告可能不包含该声明的支撑数据。",
                severity="high",
                reason="检索查询未能匹配报告中的任何 chunk",
            )],
        )

    chunks_text = "\n\n".join([
        f"[页码 {c.get('page_number', '?')}] {c.get('text', '')}"
        for c in chunks[:15]  # Limit to prevent token overflow
    ])

    prompt = f"""{ADJUDICATION_PROMPT}

待裁决的声明：
{claim.claim_text}

检索到的证据 chunks：
{chunks_text}"""

    adjudication_config = {
        "thinking_config": {"thinking_level": "high"},
        "response_mime_type": "application/json",
        "temperature": 0.1,
    }
    if doc_cache_name and doc_cache_name != "__nocache__":
        adjudication_config["cached_content"] = doc_cache_name

    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=adjudication_config,
        )
        raw = response.text
        from l2_extractor import _robust_parse_json
        vdata = _robust_parse_json(raw) if isinstance(raw, str) else raw

        # Gemini sometimes wraps the verdict in a list (e.g. `[{...}]`).
        # Unwrap to a single dict before constructing ClaimVerdict.
        if isinstance(vdata, list):
            if not vdata:
                raise ValueError("Adjudication returned empty list")
            vdata = vdata[0]
        if not isinstance(vdata, dict):
            raise ValueError(f"Adjudication returned {type(vdata).__name__}, expected dict")

        # Force our claim_id (we override anyway) and supply defaults for
        # any required field the LLM omitted, so Pydantic validation passes.
        vdata["claim_id"] = claim.claim_id
        vdata.setdefault("verdict", "insufficient_evidence")
        vdata.setdefault("confidence", 0.5)
        vdata.setdefault("evidence_risk_score", 50.0)
        vdata.setdefault("supporting_evidence", [])
        vdata.setdefault("contradicting_evidence", [])
        vdata.setdefault("evidence_gaps", [])

        verdict = ClaimVerdict.model_validate(vdata)
        return verdict
    except Exception as e:
        logger.error(f"Adjudication failed for {claim.claim_id}: {e}")
        return ClaimVerdict(
            claim_id=claim.claim_id,
            verdict=Verdict.INSUFFICIENT_EVIDENCE,
            confidence=0.2,
            evidence_risk_score=60.0,
            evidence_gaps=[EvidenceGap(
                gap_type="adjudication_error",
                description=f"证据裁决调用失败: {str(e)[:200]}",
                severity="high",
                reason="LLM 调用异常",
            )],
        )


async def verify_single_claim(
    claim: Claim,
    store_name: str,
    system_cache_name: str,
    doc_cache_name: str,
    semaphore: asyncio.Semaphore,
    use_pro: bool = False,
) -> ClaimVerdict:
    """单条声明的完整证据核验流程（含并发控制）。

    1. Generate queries
    2. Parallel File Search
    3. Deduplicate
    4. Adjudicate
    """
    async with semaphore:
        # 1) Generate queries
        queries = await generate_queries(claim, system_cache_name)

        # 2) Retrieve
        all_chunks = await retrieve_for_queries(queries, store_name)

        # 3) Deduplicate
        unique_chunks = deduplicate_chunks(all_chunks)

        # 4) Adjudicate
        verdict = await adjudicate_evidence(claim, unique_chunks, doc_cache_name, use_pro=use_pro)

        logger.info(
            f"{claim.claim_id}: verdict={verdict.verdict.value} "
            f"confidence={verdict.confidence:.2f} "
            f"evidence_risk={verdict.evidence_risk_score:.0f} "
            f"chunks={len(unique_chunks)}"
        )
        return verdict


async def verify_all_claims(
    claims: list[Claim],
    store_name: str,
    system_cache_name: str,
    doc_cache_name: str,
    max_concurrent: int = MAX_CONCURRENT_VERIFICATIONS,
) -> list[ClaimVerdict]:
    """对所有声明并行执行证据核验。

    Args:
        claims: 待核验的声明列表
        store_name: File Search Store
        system_cache_name: 系统 context cache
        doc_cache_name: 文档 context cache
        max_concurrent: 最大并发数

    Returns:
        List[ClaimVerdict]: 按输入顺序排列的裁决结果
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    tasks = [
        verify_single_claim(c, store_name, system_cache_name, doc_cache_name, semaphore)
        for c in claims
    ]
    return await asyncio.gather(*tasks)


# ── Batch API mode ──

async def pre_retrieve_all_chunks(
    claims: list[Claim],
    store_name: str,
    system_cache_name: str,
    max_concurrent: int = MAX_CONCURRENT_VERIFICATIONS,
) -> dict[str, list[dict]]:
    """Pre-retrieve evidence chunks for all claims (before batch submission).

    Returns: {claim_id: [deduplicated chunks]}
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def retrieve_one(claim: Claim):
        async with semaphore:
            queries = await generate_queries(claim, system_cache_name)
            all_chunks = await retrieve_for_queries(queries, store_name)
            return claim.claim_id, deduplicate_chunks(all_chunks)

    tasks = [retrieve_one(c) for c in claims]
    results = await asyncio.gather(*tasks)
    return dict(results)


async def submit_batch_adjudication(
    claims: list[Claim],
    chunks_map: dict[str, list[dict]],
    doc_cache_name: str,
    use_pro: bool = False,
) -> dict:
    """Submit all L3 adjudication requests as a Gemini Batch API job.

    File Search retrieval must be completed BEFORE calling this.
    Returns: {mode: "batch", batch_job_id: str, claims_count: int}
    """
    client = _get_client()
    model = VERIFICATION_MODEL_PRO if use_pro else VERIFICATION_MODEL

    # Build batch requests
    requests = []
    for claim in claims:
        chunks = chunks_map.get(claim.claim_id, [])
        chunks_text = "\n\n".join([
            f"[页码 {c.get('page_number', '?')}] {c.get('text', '')}"
            for c in chunks[:15]
        ]) if chunks else "（未检索到证据）"

        prompt = f"""{ADJUDICATION_PROMPT}

待裁决的声明：
{claim.claim_text}

检索到的证据 chunks：
{chunks_text}"""

        requests.append({
            "model": model,
            "contents": prompt,
            "config": {
                "thinking_config": {"thinking_level": "high"},
                "response_mime_type": "application/json",
                "cached_content": doc_cache_name,
                "temperature": 0.1,
            },
        })

    # Submit batch job
    try:
        job = client.batches.create(
            model=model,
            requests=requests,
            config={"display_name": f"evidence-verdicts-{claims[0].claim_id[:3]}"},
        )
        logger.info(f"Batch job submitted: {job.name} ({len(requests)} requests)")
        return {
            "mode": "batch",
            "batch_job_id": job.name,
            "status": "submitted",
            "claims_count": len(requests),
            "estimated_completion": "10-30 minutes",
        }
    except Exception as e:
        logger.error(f"Batch submission failed: {e}")
        raise RuntimeError(f"Batch API 提交失败: {e}") from e


async def poll_batch_results(batch_job_id: str) -> list[ClaimVerdict]:
    """Poll a batch job and retrieve results. Returns parsed ClaimVerdicts."""
    client = _get_client()

    try:
        job = client.batches.get(name=batch_job_id)
    except Exception as e:
        raise RuntimeError(f"Batch job 查询失败: {e}") from e

    if job.state == "JOB_STATE_FAILED":
        raise RuntimeError(f"Batch job 失败: {getattr(job, 'error', 'unknown error')}")

    if job.state not in ("JOB_STATE_SUCCEEDED",):
        return []  # Still running — caller should poll again

    # Retrieve results
    verdicts = []
    try:
        results = client.batches.get_result(name=batch_job_id)
        for result in results:
            try:
                raw = result.text
                import json as _json
                vdata = _json.loads(raw) if isinstance(raw, str) else raw
                verdicts.append(ClaimVerdict(**vdata))
            except Exception as parse_err:
                logger.warning(f"Failed to parse batch result: {parse_err}")
                verdicts.append(ClaimVerdict(
                    claim_id="unknown",
                    verdict=Verdict.INSUFFICIENT_EVIDENCE,
                    confidence=0.1,
                    evidence_risk_score=60.0,
                ))
    except Exception as e:
        logger.error(f"Failed to retrieve batch results: {e}")
        raise

    return verdicts

