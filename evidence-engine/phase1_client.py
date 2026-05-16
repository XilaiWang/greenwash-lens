"""
Phase 1 language layer integration — calls Node.js backend's deep-analyze endpoint.

For each extracted claim, runs the M3/M4/M5 deep analysis to get text_risk_score.
Results populate claim.language_analysis for dual-dimension scoring in L4.
"""

import logging
import asyncio
from typing import Optional

import httpx

from config import PHASE1_API_URL
from models import Claim

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30.0  # seconds per claim
MAX_CONCURRENT = 5      # don't overwhelm the Node.js backend


async def run_phase1_on_claim(
    claim: Claim,
    timeout: float = DEFAULT_TIMEOUT,
) -> Optional[dict]:
    """Run Phase 1 deep analysis on a single claim.

    Args:
        claim: The claim to analyze
        timeout: HTTP request timeout in seconds

    Returns:
        language_analysis dict or None if unavailable
    """
    url = f"{PHASE1_API_URL}/api/v1/deep-analyze"
    payload = {"text": claim.claim_text}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        logger.warning(f"Phase 1 HTTP error for {claim.claim_id}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Phase 1 call failed for {claim.claim_id}: {e}")
        return None

    # Extract text_risk_score from the deep-analyze response
    scoring = data.get("scoring", {})
    modules = data.get("modules", {})

    return {
        "text_risk_score": scoring.get("TGRI", 0),
        "risk_level": scoring.get("risk_level", "unknown"),
        "primary_type": scoring.get("primary_type", "unknown"),
        "M3_vagueness": (modules.get("M3_vagueness") or {}).get("score", 0),
        "M4_framing": (modules.get("M4_promotional_framing") or {}).get("score", 0),
        "M5_gap": (modules.get("M5_commitment_action") or {}).get("score", 0),
    }


async def run_phase1_on_all_claims(
    claims: list[Claim],
    max_concurrent: int = MAX_CONCURRENT,
) -> list[Claim]:
    """Run Phase 1 language analysis on all claims in parallel.

    Updates claim.language_analysis in-place and returns the modified list.
    Gracefully handles Phase 1 unavailability — claims without analysis
    get text_risk_score = 0 (evidence-only scoring).
    """
    if not claims:
        return claims

    semaphore = asyncio.Semaphore(max_concurrent)

    async def analyze_one(claim: Claim):
        async with semaphore:
            result = await run_phase1_on_claim(claim)
            if result:
                claim.language_analysis = result
                logger.debug(f"{claim.claim_id}: text_risk={result['text_risk_score']:.0f}")
            else:
                claim.language_analysis = {
                    "text_risk_score": 0,
                    "risk_level": "unknown",
                    "primary_type": "Phase 1 unavailable",
                }
            return claim

    tasks = [analyze_one(c) for c in claims]
    results = await asyncio.gather(*tasks)

    successful = sum(1 for c in results if c.language_analysis and c.language_analysis.get("text_risk_score", 0) > 0)
    if successful == 0:
        logger.warning("Phase 1 unavailable for all claims — using evidence-only scoring")
    else:
        logger.info(f"Phase 1 completed: {successful}/{len(claims)} claims scored")

    return list(results)


async def check_phase1_health() -> bool:
    """Check if Phase 1 backend is reachable."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{PHASE1_API_URL}/api/health")
            return resp.is_success
    except Exception:
        return False
