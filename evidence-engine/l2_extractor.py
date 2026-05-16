"""
L2: ESG claim extraction from indexed PDF.

Uses Gemini Flash with File Search tool to scan the report and extract
all independently-verifiable ESG claims as structured Claim objects.
"""

import logging
from google import genai
from google.genai import types

from config import (
    GEMINI_API_KEY,
    EXTRACTION_MODEL,
    require_api_key,
)
from models import Claim, ClaimType

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """你是 ESG 报告的声明抽取专家。从 ESG 报告文本中提取所有可独立验证的 ESG 声明。

【什么是"可验证的 ESG 声明"】
满足以下任一条件的句子：
- 包含具体数值、百分比、时间范围的环境/社会绩效陈述
- 关于未来的目标、承诺、计划
- 关于产品/服务环保属性的具体声明
- 关于第三方认证、审计、奖项的陈述
- 关于运营实践（如可再生能源使用、供应链管理）的具体描述

【应排除的内容】
- 纯粹的愿景/价值观陈述（"我们重视可持续发展"）—— 由语言层处理
- 治理结构描述、董事会成员信息等非 ESG 绩效内容
- 引用外部新闻、报告的内容

【对每条声明的标注】
根据如下 JSON 结构输出。每条声明：
- claim_id: "C001", "C002" 格式
- claim_text: 原文（≤200字）
- page_number: 数字（从检索结果中提取）
- source_section: 章节名
- claim_type: "P"（产品营销）| "D"（披露数据）| "C"（未来承诺）
- claim_subtypes: 从[quantitative_achievement, boundary_specified, third_party_certified,
    future_commitment, vague_statement, specific_action] 中选择适用的
- verifiable_facts: 可被报告其他位置交叉验证的事实点列表

【数量约束】
- 最多提取 30 条声明（按重要性排序）
- 每条声明必须可在报告内找到至少一种验证路径
- 按页码顺序排列

扫描整份报告，严格按照规则提取。"""


_client = None

def _get_client():
    global _client
    if _client is None:
        require_api_key()
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


async def extract_claims(
    store_name: str,
    system_cache_name: str,
) -> list[Claim]:
    """从已索引的报告中抽取所有可验证 ESG 声明。

    Args:
        store_name: File Search Store 名称
        system_cache_name: 系统级 context cache 名称

    Returns:
        List[Claim]: 抽取到的声明列表（15-30条）
    """
    client = _get_client()

    config = {
        "tools": [{
            "file_search": {
                "file_search_store_names": [store_name],
            }
        }],
        "thinking_config": {"thinking_level": "low"},
        "response_mime_type": "application/json",
        "temperature": 0.1,
    }
    if system_cache_name and system_cache_name != "__nocache__":
        config["cached_content"] = system_cache_name

    try:
        response = client.models.generate_content(
            model=EXTRACTION_MODEL,
            contents=EXTRACTION_PROMPT,
            config=config,
        )
    except Exception as e:
        logger.error(f"Claim extraction failed: {e}")
        raise RuntimeError(f"声明抽取失败: {e}") from e

    try:
        raw = response.text
        import json as _json
        data = _json.loads(raw) if isinstance(raw, str) else raw
        claims_data = data.get("claims", []) if isinstance(data, dict) else data
    except Exception as e:
        logger.error(f"Failed to parse extraction response: {e}")
        raise RuntimeError(f"声明解析失败: {e}") from e

    if not claims_data:
        logger.warning("No claims extracted from report")
        return []

    # Validate and filter claims
    valid_claims = []
    for i, cdata in enumerate(claims_data):
        cid = cdata.get("claim_id", f"C{i+1:03d}")
        ctext = cdata.get("claim_text", "").strip()
        if not ctext:
            logger.warning(f"Skipping empty claim at index {i}")
            continue
        page = int(cdata.get("page_number", 1) or 1)
        if page < 1:
            page = 1
        if len(ctext) > 300:
            ctext = ctext[:297] + "..."
        ctype_raw = cdata.get("claim_type", "D")
        try:
            ctype = ClaimType(ctype_raw)
        except ValueError:
            ctype = ClaimType.DISCLOSURE
        claim = Claim(
            claim_id=cid,
            claim_text=ctext,
            page_number=page,
            source_section=cdata.get("source_section", ""),
            claim_type=ctype,
            claim_subtypes=cdata.get("claim_subtypes", []),
            verifiable_facts=cdata.get("verifiable_facts", []),
        )
        valid_claims.append(claim)

    logger.info(f"Extracted {len(valid_claims)} verifiable claims")
    return valid_claims
