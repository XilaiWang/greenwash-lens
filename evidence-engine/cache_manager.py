"""
Context cache management — system-level and document-level caching.

System cache: 漂绿检测理论框架 + 评分规则。全局共享，24h TTL。
Document cache: 已索引的 ESG 报告。每次分析独立，1h TTL。
"""

import logging
from google import genai
from google.genai import types

from config import (
    GEMINI_API_KEY,
    CACHE_MODEL,
    SYSTEM_PROMPT,
    require_api_key,
)

logger = logging.getLogger(__name__)


_client = None

def _get_client():
    global _client
    if _client is None:
        require_api_key()
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client

_system_cache_name: str | None = None


def get_or_create_system_cache() -> str:
    """获取或创建系统级 context cache（幂等）。"""
    global _system_cache_name

    if _system_cache_name:
        try:
            # 验证缓存仍有效
            _get_client().caches.get(name=_system_cache_name)
            return _system_cache_name
        except Exception:
            logger.warning("System cache expired or deleted, recreating...")
            _system_cache_name = None

    try:
        cache = _get_client().caches.create(
            model=CACHE_MODEL,
            config={
                "display_name": "greenwash-framework-v2",
                "system_instruction": SYSTEM_PROMPT,
                "ttl": "86400s",  # 24 hours
            },
        )
        _system_cache_name = cache.name
        logger.info(f"System cache created: {cache.name}")
        return cache.name
    except Exception as e:
        logger.warning(f"Failed to create system cache (will proceed without): {e}")
        _system_cache_name = "__nocache__"
        return _system_cache_name


def create_document_cache(store_name: str, ttl: str = "3600s") -> str:
    """为已索引的文档创建 context cache。

    Args:
        store_name: File Search Store 名称
        ttl: TTL 字符串 ("3600s" = 1 hour)

    Returns:
        cache_name: 可传入 generate_content 的缓存名称
    """
    try:
        cache = _get_client().caches.create(
            model=CACHE_MODEL,
            config={
                "display_name": f"doc-{store_name.split('/')[-1]}",
                "tools": [{
                    "file_search": {
                        "file_search_store_names": [store_name]
                    }
                }],
                "ttl": ttl,
            },
        )
        logger.info(f"Document cache created: {cache.name}")
        return cache.name
    except Exception as e:
        logger.warning(f"Failed to create document cache (will proceed without): {e}")
        return "__nocache__"


def delete_cache(cache_name: str) -> bool:
    """删除 context cache。"""
    try:
        _get_client().caches.delete(name=cache_name)
        logger.info(f"Cache deleted: {cache_name}")
        return True
    except Exception as e:
        logger.warning(f"Failed to delete cache {cache_name}: {e}")
        return False


def delete_system_cache():
    """删除系统级缓存（框架升级时使用）。"""
    global _system_cache_name
    if _system_cache_name:
        delete_cache(_system_cache_name)
        _system_cache_name = None
        logger.info("System cache cleared.")
