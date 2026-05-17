"""
Greenwashing Lens Evidence Engine — Python Sidecar Server.

Provides:
  POST /upload       — Upload PDF, create Store, start indexing
  GET  /status/:id   — Poll analysis progress
  GET  /health       — Health check + Gemini SDK version
  POST /cleanup/:id   — Delete Store + caches for an analysis
"""

import os
import uuid
import asyncio
import logging
import tempfile
from datetime import datetime, timezone

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from google import genai

from config import (
    SIDECAR_HOST,
    SIDECAR_PORT,
    MAX_PDF_SIZE_BYTES,
)
from models import (
    UploadResponse,
    StatusResponse,
    AnalysisStatus,
    DocumentReport,
    Verdict,
    Claim,
    ClaimVerdict,
)
from l1_store import (
    create_store_and_index,
    delete_store,
)
from l2_extractor import extract_claims
from l3_verifier import (
    verify_all_claims,
    pre_retrieve_all_chunks,
    submit_batch_adjudication,
    poll_batch_results,
)
from phase1_client import run_phase1_on_all_claims
from cache_manager import (
    get_or_create_system_cache,
    create_document_cache,
    delete_cache,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("evidence-engine")

# --- In-memory analysis state (capped at 100 entries) ---
analyses: dict[str, dict] = {}
MAX_ANALYSES = 100


def _trim_analyses():
    """Remove oldest entries if over limit."""
    if len(analyses) <= MAX_ANALYSES:
        return
    sorted_ids = sorted(analyses.keys(), key=lambda k: analyses[k].get("created_at", ""))
    while len(analyses) > MAX_ANALYSES:
        oldest = sorted_ids.pop(0)
        a = analyses.pop(oldest, None)
        if a:
            logger.warning(f"Evicted oldest analysis {oldest} (memory limit)")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _save_upload_file(upload: UploadFile) -> str:
    """Save upload to temp file. Returns path. Raises ValueError if too large."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", prefix="greenwashing-")
    total = 0
    while chunk := await upload.read(8 * 1024 * 1024):  # 8MB chunks
        total += len(chunk)
        if total > MAX_PDF_SIZE_BYTES:
            tmp.close()
            os.unlink(tmp.name)
            raise ValueError(f"文件过大（>{MAX_PDF_SIZE_BYTES / 1024 / 1024:.0f}MB）")
        tmp.write(chunk)
    tmp.close()
    return tmp.name


async def _run_analysis(analysis_id: str, pdf_path: str, company: str, year: int, language: str):
    """后台执行完整分析 pipeline（L1→L2→L3→L4）。"""
    try:
        a = analyses[analysis_id]

        # ── L1: Index ──
        a["status"] = AnalysisStatus.INDEXING.value
        a["progress"] = 10
        store_name = await create_store_and_index(
            pdf_path, company=company, year=year, language=language
        )
        a["store_name"] = store_name
        a["progress"] = 30
        logger.info(f"[{analysis_id}] Store created: {store_name}")

        # System cache + Document cache
        a["progress"] = 35
        sys_cache = get_or_create_system_cache()
        a["system_cache_name"] = sys_cache
        doc_cache = create_document_cache(store_name)
        a["doc_cache_name"] = doc_cache
        a["progress"] = 40
        logger.info(f"[{analysis_id}] Caches ready")

        # ── L2: Extract claims ──
        a["status"] = AnalysisStatus.EXTRACTING.value
        a["progress"] = 45
        claims = await extract_claims(store_name, sys_cache)
        a["claims"] = [c.model_dump() for c in claims]
        a["claims_count"] = len(claims)
        a["progress"] = 55
        logger.info(f"[{analysis_id}] Extracted {len(claims)} claims")

        if not claims:
            a["status"] = AnalysisStatus.COMPLETED.value
            a["progress"] = 100
            a["key_findings"] = ["未在报告中检测到可验证的 ESG 声明。"]
            logger.info(f"[{analysis_id}] No claims found — analysis complete")
            return

        # ── L2.5: Phase 1 language analysis ──
        a["progress"] = 57
        claims = await run_phase1_on_all_claims(claims)
        a["claims"] = [c.model_dump() for c in claims]  # Update with language_analysis
        a["progress"] = 60
        logger.info(f"[{analysis_id}] Phase 1 language analysis complete")

        # ── L3: Verify claims ──
        a["status"] = AnalysisStatus.VERIFYING.value
        a["progress"] = 60
        verdicts = await verify_all_claims(
            claims, store_name, sys_cache, doc_cache
        )
        a["verdicts"] = [v.model_dump() for v in verdicts]
        a["verdicts_complete"] = len(verdicts)
        a["progress"] = 85
        logger.info(f"[{analysis_id}] Verified {len(verdicts)} claims")

        # ── L4: Aggregate ──
        a["status"] = AnalysisStatus.AGGREGATING.value
        a["progress"] = 90
        report = _aggregate_report(claims, verdicts, company, year, analysis_id)
        a["report"] = report.model_dump()
        a["progress"] = 95

        # Generate findings
        findings = _generate_findings(verdicts)
        a["key_findings"] = findings
        a["highest_risk_claims"] = _top_risk_claims(claims, verdicts, n=5)

        a["status"] = AnalysisStatus.COMPLETED.value
        a["progress"] = 100
        a["completed_at"] = _now_iso()
        logger.info(f"[{analysis_id}] Analysis complete — {len(claims)} claims, "
                     f"{_verdict_distribution(verdicts)}")

    except Exception as e:
        logger.error(f"[{analysis_id}] Pipeline failed: {e}", exc_info=True)
        a["status"] = AnalysisStatus.FAILED.value
        a["error"] = str(e)
    finally:
        if os.path.exists(pdf_path):
            try:
                os.unlink(pdf_path)
            except OSError:
                pass


# ── L4 helpers ──

def _aggregate_report(claims, verdicts, company, year, analysis_id) -> DocumentReport:
    """Aggregate claims + verdicts into document-level report."""
    text_scores = []
    evidence_scores = []
    for c in claims:
        la = c.language_analysis or {}
        text_scores.append(la.get("text_risk_score", 0))
    for v in verdicts:
        evidence_scores.append(v.evidence_risk_score)

    text_risk = sum(text_scores) / max(len(text_scores), 1)
    evidence_risk = sum(evidence_scores) / max(len(evidence_scores), 1)
    document_gri = 0.5 * text_risk + 0.5 * evidence_risk

    if document_gri <= 25:
        risk_level = "低风险"
    elif document_gri <= 50:
        risk_level = "中低风险"
    elif document_gri <= 75:
        risk_level = "中高风险"
    else:
        risk_level = "高风险"

    dist = {"supported": 0, "partially_supported": 0, "contradicted": 0, "insufficient_evidence": 0}
    for v in verdicts:
        key = v.verdict.value if hasattr(v.verdict, "value") else str(v.verdict)
        dist[key] = dist.get(key, 0) + 1

    return DocumentReport(
        company=company,
        report_year=year,
        analysis_id=analysis_id,
        analysis_timestamp=_now_iso(),
        total_claims=len(claims),
        claims=[c.model_dump() if hasattr(c, "model_dump") else c for c in claims],
        scoring={
            "text_risk_score": round(text_risk, 1),
            "evidence_risk_score": round(evidence_risk, 1),
            "document_GRI": round(document_gri, 1),
            "risk_level": risk_level,
            "claim_verdict_distribution": dist,
        },
        # Populate from the verdicts we already have rather than leaving empty.
        # /report consumers (UI, JSON export) expect these to be present.
        key_findings=_generate_findings(verdicts),
        highest_risk_claims=_top_risk_claims(claims, verdicts, n=5),
    )


def _generate_findings(verdicts) -> list[str]:
    """Generate document-level key findings from verdicts."""
    findings = []
    contradicted = sum(1 for v in verdicts if v.verdict == Verdict.CONTRADICTED)
    insufficient = sum(1 for v in verdicts if v.verdict == Verdict.INSUFFICIENT_EVIDENCE)
    partial = sum(1 for v in verdicts if v.verdict == Verdict.PARTIALLY_SUPPORTED)

    if contradicted:
        findings.append(f"{contradicted} 条声明与报告其他部分存在矛盾，需优先关注。")
    if insufficient:
        findings.append(f"{insufficient} 条声明缺乏足够证据支撑，建议补充数据。")
    if partial:
        findings.append(f"{partial} 条声明获得部分证据支持，存在边界或方法缺口。")
    if not findings:
        findings.append("所有声明均有充分证据支持。")

    return findings


def _top_risk_claims(claims, verdicts, n: int = 5) -> list[dict]:
    """Return top-N highest risk claims with evidence snippets."""
    pairs = list(zip(claims, verdicts))
    pairs.sort(key=lambda cv: cv[1].evidence_risk_score, reverse=True)
    return [
        {
            "claim_id": c.claim_id,
            "claim_text": c.claim_text[:150],
            "verdict": v.verdict.value,
            "evidence_risk_score": v.evidence_risk_score,
            "key_evidence": [
                {"page": e.page_number, "text": e.chunk_text[:120]}
                for e in (v.supporting_evidence[:1] + v.contradicting_evidence[:1])
            ],
        }
        for c, v in pairs[:n]
    ]


def _verdict_distribution(verdicts) -> str:
    """Human-readable verdict distribution."""
    from collections import Counter
    c = Counter(v.verdict.value for v in verdicts)
    return ", ".join(f"{k}={c[k]}" for k in sorted(c.keys()))


# --- App ---

app = FastAPI(
    title="Greenwashing Lens Evidence Engine",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
)


@app.get("/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "version": "2.0.0",
        "gemini_sdk": genai.__version__,
        "active_analyses": len(analyses),
    })


@app.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    company: str = Form("unknown"),
    year: int = Form(2024),
    report_type: str = Form("esg_report"),
    language: str = Form("zh"),
):
    """Upload PDF and index into File Search Store."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "仅支持 PDF 格式的文件")

    analysis_id = str(uuid.uuid4())

    # Save upload
    try:
        pdf_path = await _save_upload_file(file)
    except ValueError as e:
        raise HTTPException(413, str(e)) from e

    analyses[analysis_id] = {
        "status": AnalysisStatus.UPLOADING.value,
        "progress": 5,
        "company": company,
        "year": year,
        "report_type": report_type,
        "language": language,
        "created_at": _now_iso(),
    }
    _trim_analyses()

    # Start background indexing
    asyncio.create_task(
        _run_analysis(analysis_id, pdf_path, company, year, language)
    )

    return JSONResponse(UploadResponse(
        analysis_id=analysis_id,
        status="indexing",
        store_name=f"stores/{company}_{year}_{analysis_id[:8]}",
        estimated_duration="10-30 秒",
    ).model_dump())


@app.get("/status/{analysis_id}")
async def get_status(analysis_id: str):
    """Poll analysis progress."""
    if analysis_id not in analyses:
        raise HTTPException(404, "Analysis not found")

    a = analyses[analysis_id]
    return JSONResponse(StatusResponse(
        analysis_id=analysis_id,
        status=a["status"],
        progress=a.get("progress", 0),
        claims_found=a.get("claims_count"),
        verdicts_complete=a.get("verdicts_complete"),
        error=a.get("error"),
    ).model_dump())


@app.post("/extract/{analysis_id}")
async def extract(analysis_id: str):
    """L2: 从已索引的报告中抽取声明。"""
    if analysis_id not in analyses:
        raise HTTPException(404, "Analysis not found")

    a = analyses[analysis_id]
    if "store_name" not in a:
        raise HTTPException(400, "请先上传 PDF 建立索引")

    a["status"] = AnalysisStatus.EXTRACTING.value
    claims = await extract_claims(a["store_name"], a.get("system_cache_name", ""))
    a["claims"] = [c.model_dump() for c in claims]
    a["claims_count"] = len(claims)
    a["status"] = AnalysisStatus.COMPLETED.value

    return JSONResponse({
        "analysis_id": analysis_id,
        "claims_count": len(claims),
        "claims": a["claims"],
    })


@app.post("/verify/{analysis_id}")
async def verify(analysis_id: str):
    """L3: 对已抽取的声明执行证据核验。"""
    if analysis_id not in analyses:
        raise HTTPException(404, "Analysis not found")

    a = analyses[analysis_id]
    if "claims" not in a or not a["claims"]:
        raise HTTPException(400, "请先抽取声明（POST /extract）")

    claims = [Claim(**c) for c in a["claims"]]
    a["status"] = AnalysisStatus.VERIFYING.value
    a["progress"] = 60

    verdicts = await verify_all_claims(
        claims,
        a["store_name"],
        a.get("system_cache_name", ""),
        a.get("doc_cache_name", ""),
    )
    a["verdicts"] = [v.model_dump() for v in verdicts]
    a["verdicts_complete"] = len(verdicts)
    a["status"] = AnalysisStatus.COMPLETED.value
    a["progress"] = 90

    return JSONResponse({
        "analysis_id": analysis_id,
        "verdicts_complete": len(verdicts),
        "distribution": _verdict_distribution(verdicts),
        "verdicts": a["verdicts"],
    })


@app.post("/verify-batch/{analysis_id}")
async def verify_batch(analysis_id: str):
    """L3 Batch: 提交批量裁决任务（File Search 预检索 + Batch API 提交）。

    与 /verify 的区别：
    - /verify: 实时异步并行裁决（~30s）
    - /verify-batch: 提交 Batch API job（~15min，成本降低 50%）
    """
    if analysis_id not in analyses:
        raise HTTPException(404, "Analysis not found")

    a = analyses[analysis_id]
    if "claims" not in a or not a["claims"]:
        raise HTTPException(400, "请先抽取声明（POST /extract）")

    claims = [Claim(**c) for c in a["claims"]]
    a["status"] = AnalysisStatus.VERIFYING.value
    a["progress"] = 60

    # Step 1: Pre-retrieve chunks
    chunks_map = await pre_retrieve_all_chunks(
        claims, a["store_name"], a.get("system_cache_name", ""),
    )
    a["chunks_map"] = {k: v for k, v in chunks_map.items()}
    a["progress"] = 70

    # Step 2: Submit batch job
    batch_info = await submit_batch_adjudication(
        claims, chunks_map, a.get("doc_cache_name", ""),
    )
    a["batch_job_id"] = batch_info["batch_job_id"]
    a["status"] = AnalysisStatus.BATCH_SUBMITTED.value
    a["progress"] = 75

    return JSONResponse(batch_info)


@app.get("/batch-status/{analysis_id}")
async def get_batch_status(analysis_id: str):
    """轮询 Batch job 状态。如果完成，自动填充 verdicts 并聚合报告。"""
    if analysis_id not in analyses:
        raise HTTPException(404, "Analysis not found")

    a = analyses[analysis_id]
    batch_job_id = a.get("batch_job_id")
    if not batch_job_id:
        raise HTTPException(400, "该分析未提交 Batch job")

    try:
        verdicts = await poll_batch_results(batch_job_id)
    except Exception as e:
        return JSONResponse({"status": "error", "error": str(e)})

    if not verdicts:
        return JSONResponse({
            "analysis_id": analysis_id,
            "status": "running",
            "message": "Batch job 仍在处理中，请稍后重试。",
        })

    # Batch complete — store verdicts and aggregate
    a["verdicts"] = [v.model_dump() for v in verdicts]
    a["verdicts_complete"] = len(verdicts)
    a["progress"] = 90

    claims = [Claim(**c) for c in a.get("claims", [])]
    report = _aggregate_report(claims, verdicts, a.get("company", "unknown"),
                                a.get("year", 0), analysis_id)
    a["report"] = report.model_dump()
    a["key_findings"] = _generate_findings(verdicts)
    a["highest_risk_claims"] = _top_risk_claims(claims, verdicts)
    a["status"] = AnalysisStatus.COMPLETED.value
    a["progress"] = 100

    return JSONResponse({
        "analysis_id": analysis_id,
        "status": "completed",
        "verdicts_complete": len(verdicts),
        "distribution": _verdict_distribution(verdicts),
    })


@app.get("/report/{analysis_id}")
async def get_report(analysis_id: str):
    """L4: 获取完整分析报告（含双维度评分和 GRI）。"""
    if analysis_id not in analyses:
        raise HTTPException(404, "Analysis not found")

    a = analyses[analysis_id]

    if "report" in a:
        return JSONResponse(a["report"])

    # Reconstruct report from available data if not pre-computed
    if "claims" not in a or "verdicts" not in a:
        raise HTTPException(409, "报告数据不完整，请等待分析完成")

    claims = [Claim(**c) for c in a["claims"]]
    verdicts = [ClaimVerdict(**v) for v in a["verdicts"]]
    report = _aggregate_report(claims, verdicts, a.get("company", "unknown"),
                                a.get("year", 0), analysis_id)
    return JSONResponse(report.model_dump())


@app.post("/cleanup/{analysis_id}")
async def cleanup(analysis_id: str):
    """Delete Store + caches for an analysis."""
    if analysis_id not in analyses:
        raise HTTPException(404, "Analysis not found")

    a = analyses[analysis_id]
    errors = []

    if "store_name" in a:
        if not await delete_store(a["store_name"]):
            errors.append("store_deletion_failed")

    if "doc_cache_name" in a:
        if not delete_cache(a["doc_cache_name"]):
            errors.append("doc_cache_deletion_failed")

    del analyses[analysis_id]

    return JSONResponse({
        "ok": len(errors) == 0,
        "errors": errors if errors else None,
    })


# --- Entry Point ---

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "sidecar_server:app",
        host=SIDECAR_HOST,
        port=SIDECAR_PORT,
        log_level="info",
    )
