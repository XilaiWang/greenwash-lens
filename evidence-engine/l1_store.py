"""
L1: File Search Store — creation, upload, indexing, cleanup.

Uses Gemini File Search API to create a searchable store from a PDF.
"""

import os
import uuid
import asyncio
from pathlib import Path

from google import genai
from google.genai import types

from config import (
    GEMINI_API_KEY,
    CHUNKING_CONFIGS,
    MAX_PDF_SIZE_BYTES,
    STORE_TTL_HOURS,
    require_api_key,
)


_client = None

def _get_client():
    """Lazy singleton client — reuses the same httpx session across calls."""
    global _client
    if _client is None:
        require_api_key()
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def select_chunking_config(file_path: str, page_count: int = 100) -> dict:
    """根据文件特征自动选择 chunking 策略。"""
    try:
        file_size_kb = os.path.getsize(file_path) / 1024
    except OSError:
        return CHUNKING_CONFIGS["standard_esg"]
    density = file_size_kb / max(page_count, 1)
    if density > 15:
        return CHUNKING_CONFIGS["data_heavy"]
    elif density < 6:
        return CHUNKING_CONFIGS["narrative_heavy"]
    return CHUNKING_CONFIGS["standard_esg"]


async def create_store_and_index(
    pdf_path: str,
    company: str,
    year: int,
    report_type: str = "esg_report",
    language: str = "zh",
    page_count: int = 100,
) -> str:
    """创建 File Search Store 并上传 PDF 建立索引。返回 store_name。

    Args:
        pdf_path: PDF 文件路径
        company: 公司名称
        year: 报告年份
        report_type: 报告类型
        language: 语言 (zh/en)
        page_count: 估计页数（用于 chunking 策略选择）

    Returns:
        store_name: 可用于后续 File Search 检索的 Store 名称

    Raises:
        ValueError: PDF 文件过大或格式无效
        RuntimeError: 索引失败
    """
    # 验证文件
    file_size = os.path.getsize(pdf_path)
    if file_size == 0:
        raise ValueError("PDF 文件为空")
    if file_size > MAX_PDF_SIZE_BYTES:
        raise ValueError(f"PDF 文件过大（{file_size / 1024 / 1024:.1f}MB），上限 {MAX_PDF_SIZE_BYTES / 1024 / 1024:.0f}MB")

    upload_id = str(uuid.uuid4())
    chunking = select_chunking_config(pdf_path, page_count)
    client = _get_client()

    # 创建 Store
    store = client.file_search_stores.create(
        config={
            "display_name": f"{company}_{year}_{upload_id[:8]}",
        }
    )

    # 上传并索引
    operation = client.file_search_stores.upload_to_file_search_store(
        file=pdf_path,
        file_search_store_name=store.name,
        config={
            "display_name": f"{company} {year} ESG Report",
            "chunking_config": {
                "white_space_config": {
                    "max_tokens_per_chunk": chunking["max_tokens_per_chunk"],
                    "max_overlap_tokens": chunking["max_overlap_tokens"],
                }
            },
            "custom_metadata": [
                {"key": "company", "string_value": company},
                {"key": "report_year", "numeric_value": year},
                {"key": "report_type", "string_value": report_type},
                {"key": "language", "string_value": language},
                {"key": "upload_id", "string_value": upload_id},
            ],
        },
    )

    # 等待索引完成（轮询 LRO，带超时）
    # 可通过 EVIDENCE_L1_TIMEOUT_SEC 环境变量调整（默认 1500 秒 / 25 分钟）。
    # 大型报告（200+ 页）建议设到 1500 以上，小报告 600 足够。
    import time
    timeout_sec = int(os.environ.get("EVIDENCE_L1_TIMEOUT_SEC", "1500"))
    deadline = time.time() + timeout_sec
    while not operation.done:
        if time.time() > deadline:
            _cleanup_store(store.name)
            raise RuntimeError(f"索引超时（{timeout_sec // 60}分钟）")
        await asyncio.sleep(3)
        operation = client.operations.get(operation)

    if operation.error:
        _cleanup_store(store.name)
        raise RuntimeError(f"索引失败: {operation.error.message if hasattr(operation.error, 'message') else operation.error}")

    return store.name


async def delete_store(store_name: str) -> bool:
    """删除 File Search Store。返回是否成功。"""
    try:
        _get_client().file_search_stores.delete(name=store_name)
        return True
    except Exception:
        return False


def _cleanup_store(store_name: str):
    """尽力清理 Store，不抛异常。"""
    try:
        _get_client().file_search_stores.delete(name=store_name)
    except Exception:
        pass


async def retrieve_chunks(
    query_text: str,
    store_name: str,
    top_k: int = 5,
) -> list[dict]:
    """使用 File Search 检索相关 chunks。

    Args:
        query_text: 检索查询
        store_name: File Search Store 名称
        top_k: 返回 chunk 数量

    Returns:
        [{text, page_number, relevance_score}, ...]
    """
    try:
        # Use async SDK to avoid blocking the asyncio event loop during L3
        # parallel retrieval (was the root cause of the L3 hang bug).
        response = await _get_client().aio.models.generate_content(
            model="gemini-3-flash-preview",
            contents=query_text,
            config={
                "tools": [{
                    "file_search": {
                        "file_search_store_names": [store_name],
                        "top_k": top_k,
                    }
                }]
            },
        )
    except Exception:
        return []

    chunks = []
    try:
        grounding = response.candidates[0].grounding_metadata
        if grounding and grounding.grounding_chunks:
            for chunk in grounding.grounding_chunks:
                ctx = chunk.retrieved_context
                chunks.append({
                    "text": ctx.text if hasattr(ctx, "text") else "",
                    "page_number": getattr(ctx, "page_number", None),
                    "uri": getattr(ctx, "uri", ""),
                })
    except (IndexError, AttributeError):
        pass

    return chunks


async def health_check_store(store_name: str) -> bool:
    """检查 Store 是否可访问。"""
    try:
        _get_client().file_search_stores.get(name=store_name)
        return True
    except Exception:
        return False
