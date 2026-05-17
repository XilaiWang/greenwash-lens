"""
End-to-end tests for Greenwash Lens Evidence Engine — Sprint 3.

Covers: Batch API mode, Phase 1 integration, full pipeline, error recovery.
Run: pytest test_sprint3.py -v
"""

import os
os.environ.setdefault("GEMINI_API_KEY", "test-key-for-mocking")

import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock, ANY
from fastapi.testclient import TestClient

from sidecar_server import app
from models import (
    Claim, ClaimType, ClaimVerdict, Verdict, EvidenceQuery,
    SupportingChunk, EvidenceGap, GapSeverity,
)

client = TestClient(app)


# ── Helpers ──

def make_claim(cid="C001", text="排放下降23%", page=12, ctype=ClaimType.DISCLOSURE):
    return Claim(
        claim_id=cid, claim_text=text, page_number=page,
        source_section="环境绩效", claim_type=ctype,
        claim_subtypes=["quantitative_achievement"],
        verifiable_facts=["总量", "基准"],
    )


def make_verdict(cid="C001", verdict=Verdict.SUPPORTED, risk=10.0):
    return ClaimVerdict(
        claim_id=cid, verdict=verdict, confidence=0.85,
        evidence_risk_score=risk,
        supporting_evidence=[
            SupportingChunk(chunk_text="证据文本", page_number=47,
                            relevance_score=0.9, supports="可核实")
        ],
    )


# ── L1 mocks ──

def _mock_pipeline(extract_claims_ret=None, verify_ret=None):
    """Set up all mocks needed for upload → pipeline to complete."""
    if extract_claims_ret is None:
        extract_claims_ret = [make_claim()]
    if verify_ret is None:
        verify_ret = [make_verdict()]
    mocks = [
        patch("sidecar_server.create_store_and_index", new_callable=AsyncMock,
              return_value="stores/test-mock"),
        patch("sidecar_server.create_document_cache", return_value="cachedContent/doc-mock"),
        patch("sidecar_server.get_or_create_system_cache", return_value="cachedContent/sys-mock"),
        patch("sidecar_server.extract_claims", new_callable=AsyncMock,
              return_value=extract_claims_ret),
        patch("sidecar_server.run_phase1_on_all_claims", new_callable=AsyncMock,
              side_effect=lambda claims: claims),  # pass-through
        patch("sidecar_server.verify_all_claims", new_callable=AsyncMock,
              return_value=verify_ret),
    ]
    return mocks


# ══════════════════════════════════════════════════════════════════════
# Batch API mode
# ══════════════════════════════════════════════════════════════════════

class TestBatchMode:
    def test_submit_batch_returns_job_id(self):
        """Submit batch verification returns batch_job_id."""
        mocks = _mock_pipeline()
        with mocks[0], mocks[1], mocks[2], mocks[3], mocks[4], mocks[5]:
            with patch("sidecar_server.pre_retrieve_all_chunks", new_callable=AsyncMock) as mock_pre:
                mock_pre.return_value = {"C001": [{"text": "证据", "page_number": 1}]}
                with patch("sidecar_server.submit_batch_adjudication", new_callable=AsyncMock) as mock_sub:
                    mock_sub.return_value = {
                        "mode": "batch", "batch_job_id": "batches/test-job-123",
                        "status": "submitted", "claims_count": 3,
                        "estimated_completion": "10-30 minutes",
                    }

                    # Upload first
                    resp = client.post("/upload", files={
                        "file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
                    }, data={"company": "C", "year": 2024})
                    aid = resp.json()["analysis_id"]

                    # Submit batch
                    resp = client.post(f"/verify-batch/{aid}")
                    assert resp.status_code == 200
                    data = resp.json()
                    assert data["mode"] == "batch"
                    assert data["batch_job_id"] == "batches/test-job-123"
                    assert data["claims_count"] == 3

    def test_batch_status_running(self):
        """Polling batch status returns 'running' while job is incomplete."""
        mocks = _mock_pipeline()
        with mocks[0], mocks[1], mocks[2], mocks[3], mocks[4], mocks[5]:
            with patch("sidecar_server.pre_retrieve_all_chunks", new_callable=AsyncMock,
                       return_value={"C001": []}):
                with patch("sidecar_server.submit_batch_adjudication", new_callable=AsyncMock,
                           return_value={"mode": "batch", "batch_job_id": "batches/test-456",
                                         "status": "submitted", "claims_count": 1}):
                    with patch("sidecar_server.poll_batch_results", new_callable=AsyncMock,
                               return_value=[]):  # empty = still running

                        resp = client.post("/upload", files={
                            "file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
                        })
                        aid = resp.json()["analysis_id"]
                        client.post(f"/verify-batch/{aid}")

                        resp = client.get(f"/batch-status/{aid}")
                        assert resp.status_code == 200
                        data = resp.json()
                        assert data["status"] == "running"

    def test_batch_status_completed(self):
        """Polling batch status returns completed when job finishes."""
        mocks = _mock_pipeline()
        with mocks[0], mocks[1], mocks[2], mocks[3], mocks[4], mocks[5]:
            with patch("sidecar_server.pre_retrieve_all_chunks", new_callable=AsyncMock,
                       return_value={"C001": [{"text": "x", "page_number": 1}]}):
                with patch("sidecar_server.submit_batch_adjudication", new_callable=AsyncMock,
                           return_value={"mode": "batch", "batch_job_id": "batches/done",
                                         "status": "submitted", "claims_count": 1}):
                    with patch("sidecar_server.poll_batch_results", new_callable=AsyncMock,
                               return_value=[make_verdict("C001")]):

                        resp = client.post("/upload", files={
                            "file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
                        })
                        aid = resp.json()["analysis_id"]
                        client.post(f"/verify-batch/{aid}")

                        resp = client.get(f"/batch-status/{aid}")
                        assert resp.status_code == 200
                        data = resp.json()
                        assert data["status"] == "completed"
                        assert data["verdicts_complete"] == 1
                        assert "supported" in data["distribution"]

    def test_batch_requires_claims(self):
        """Batch verify returns 400 if no claims extracted."""
        with patch("sidecar_server.create_store_and_index", new_callable=AsyncMock,
                   return_value="stores/x"):
            with patch("sidecar_server.create_document_cache", return_value="c1"):
                with patch("sidecar_server.get_or_create_system_cache", return_value="c2"):
                    with patch("sidecar_server.extract_claims", new_callable=AsyncMock,
                               return_value=[]):
                        with patch("sidecar_server.run_phase1_on_all_claims",
                                   new_callable=AsyncMock, side_effect=lambda c: c):
                            with patch("sidecar_server.verify_all_claims",
                                       new_callable=AsyncMock, return_value=[]):
                                resp = client.post("/upload", files={
                                    "file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
                                })
                                aid = resp.json()["analysis_id"]

                                # Pipeline ran and found no claims
                                import time; time.sleep(1)

                                resp = client.post(f"/verify-batch/{aid}")
                                assert resp.status_code == 400


# ══════════════════════════════════════════════════════════════════════
# Phase 1 integration
# ══════════════════════════════════════════════════════════════════════

class TestPhase1Integration:
    def test_phase1_client_parses_response(self):
        """Phase 1 client correctly extracts text_risk_score from deep-analyze response."""
        import httpx
        from phase1_client import run_phase1_on_claim

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "scoring": {"TGRI": 72.5, "risk_level": "中高风险", "primary_type": "空洞承诺型"},
            "modules": {
                "M3_vagueness": {"score": 65},
                "M4_promotional_framing": {"score": 40},
                "M5_commitment_action": {"score": 85},
            },
        }
        mock_response.is_success = True

        claim = make_claim()
        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock,
                          return_value=mock_response):
            result = asyncio.run(run_phase1_on_claim(claim))

        assert result is not None
        assert result["text_risk_score"] == 72.5
        assert result["M5_gap"] == 85
        assert result["primary_type"] == "空洞承诺型"

    def test_phase1_client_handles_unavailable(self):
        """Phase 1 client returns None when backend is down."""
        import httpx
        from phase1_client import run_phase1_on_claim

        claim = make_claim()
        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock,
                          side_effect=httpx.ConnectError("Connection refused")):
            result = asyncio.run(run_phase1_on_claim(claim))

        assert result is None

    def test_phase1_all_claims_fallback(self):
        """run_phase1_on_all_claims handles all-unavailable gracefully."""
        import httpx
        from phase1_client import run_phase1_on_all_claims

        claims = [make_claim(f"C{i:03d}", f"声明 {i}") for i in range(1, 4)]

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock,
                          side_effect=httpx.ConnectError("Connection refused")):
            results = asyncio.run(run_phase1_on_all_claims(claims))

        assert len(results) == 3
        for c in results:
            assert c.language_analysis is not None
            assert c.language_analysis["text_risk_score"] == 0
            assert c.language_analysis["risk_level"] == "unknown"

    def test_health_check(self):
        """Phase 1 health check returns bool."""
        import httpx
        from phase1_client import check_phase1_health

        mock_resp = MagicMock()
        mock_resp.is_success = True
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock,
                          return_value=mock_resp):
            result = asyncio.run(check_phase1_health())
        assert result is True

        mock_resp2 = MagicMock()
        mock_resp2.is_success = False
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock,
                          return_value=mock_resp2):
            result = asyncio.run(check_phase1_health())
        assert result is False


# ══════════════════════════════════════════════════════════════════════
# Full pipeline E2E
# ══════════════════════════════════════════════════════════════════════

class TestFullPipeline:
    def test_upload_to_report_flow(self):
        """Complete flow: upload → extract → verify → report."""
        claims = [
            make_claim("C001", "Scope 1+2下降23%", 12),
            make_claim("C002", "可再生能源45%", 18),
            make_claim("C003", "承诺2035碳中和", 5, ClaimType.COMMITMENT),
        ]
        verdicts = [
            make_verdict("C001", Verdict.SUPPORTED, 10),
            make_verdict("C002", Verdict.SUPPORTED, 15),
            make_verdict("C003", Verdict.PARTIALLY_SUPPORTED, 50),
        ]

        mocks = _mock_pipeline(extract_claims_ret=claims, verify_ret=verdicts)
        with mocks[0], mocks[1], mocks[2], mocks[3], mocks[4], mocks[5]:
            # Upload
            resp = client.post("/upload", files={
                "file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
            }, data={"company": "GreenCorp", "year": 2024})
            assert resp.status_code == 200
            aid = resp.json()["analysis_id"]

            # Wait for async pipeline to complete
            import time; time.sleep(1)

            # Get report
            resp = client.get(f"/report/{aid}")
            assert resp.status_code == 200
            report = resp.json()
            assert report["company"] == "GreenCorp"
            assert report["total_claims"] == 3
            assert "text_risk_score" in report["scoring"]
            assert "evidence_risk_score" in report["scoring"]
            assert "document_GRI" in report["scoring"]
            assert "risk_level" in report["scoring"]
            assert report["scoring"]["claim_verdict_distribution"]["supported"] == 2
            assert report["scoring"]["claim_verdict_distribution"]["partially_supported"] == 1

    def test_no_claims_early_exit(self):
        """Pipeline exits early when no claims found."""
        mocks = _mock_pipeline(extract_claims_ret=[])
        with mocks[0], mocks[1], mocks[2], mocks[3], mocks[4], mocks[5]:
            resp = client.post("/upload", files={
                "file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
            })
            aid = resp.json()["analysis_id"]
            import time; time.sleep(1)

            resp = client.get(f"/status/{aid}")
            assert resp.json()["status"] == "completed"
            assert resp.json()["claims_found"] == 0

    def test_concurrent_uploads(self):
        """Multiple concurrent uploads don't interfere."""
        mocks = _mock_pipeline()
        with mocks[0], mocks[1], mocks[2], mocks[3], mocks[4], mocks[5]:
            aids = []
            for i in range(3):
                resp = client.post("/upload", files={
                    "file": (f"r{i}.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
                }, data={"company": f"Corp{i}"})
                assert resp.status_code == 200
                aids.append(resp.json()["analysis_id"])

            import time; time.sleep(1)

            # All three should have independent state
            for aid in aids:
                resp = client.get(f"/status/{aid}")
                assert resp.status_code == 200
                assert resp.json()["analysis_id"] == aid

    def test_error_recovery(self):
        """Pipeline sets status=failed on error, preserves error message."""
        # Mock extract_claims to throw
        with patch("sidecar_server.create_store_and_index", new_callable=AsyncMock,
                   return_value="stores/err"):
            with patch("sidecar_server.create_document_cache", return_value="c1"):
                with patch("sidecar_server.get_or_create_system_cache", return_value="c2"):
                    with patch("sidecar_server.extract_claims", new_callable=AsyncMock,
                               side_effect=RuntimeError("Fake extraction error")):
                        resp = client.post("/upload", files={
                            "file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
                        })
                        aid = resp.json()["analysis_id"]
                        import time; time.sleep(1)

                        resp = client.get(f"/status/{aid}")
                        assert resp.json()["status"] == "failed"
                        assert "extraction" in resp.json()["error"].lower()

    def test_report_404_for_unknown_id(self):
        resp = client.get("/report/nonexistent")
        assert resp.status_code == 404

    def test_report_409_when_incomplete(self):
        """Report returns 409 if analysis incomplete and no claims/verdicts."""
        with patch("sidecar_server.create_store_and_index", new_callable=AsyncMock,
                   return_value="stores/incomplete"):
            with patch("sidecar_server.create_document_cache", return_value="c1"):
                with patch("sidecar_server.get_or_create_system_cache", return_value="c2"):
                    # Don't mock extract_claims — let pipeline stall
                    # Just manually set an analysis entry
                    from sidecar_server import analyses
                    analyses["test-incomplete"] = {
                        "status": "verifying", "progress": 60,
                        "store_name": "stores/x",
                        "system_cache_name": "c1",
                        "doc_cache_name": "c2",
                        "claims": None,  # incomplete
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                    resp = client.get("/report/test-incomplete")
                    assert resp.status_code == 409
                    del analyses["test-incomplete"]

    def test_extract_endpoint(self):
        """POST /extract runs L2 independently."""
        from sidecar_server import analyses
        analyses["test-extract"] = {
            "status": "indexing", "progress": 50,
            "store_name": "stores/x",
            "system_cache_name": "cachedContent/sys",
            "created_at": "2026-01-01T00:00:00Z",
        }

        with patch("sidecar_server.extract_claims", new_callable=AsyncMock,
                   return_value=[make_claim("C001"), make_claim("C002")]):
            resp = client.post("/extract/test-extract")
            assert resp.status_code == 200
            assert resp.json()["claims_count"] == 2
            assert len(resp.json()["claims"]) == 2

        del analyses["test-extract"]

    def test_verify_endpoint(self):
        """POST /verify runs L3 independently."""
        from sidecar_server import analyses
        analyses["test-verify"] = {
            "status": "extracting", "progress": 55,
            "store_name": "stores/x",
            "system_cache_name": "cachedContent/sys",
            "doc_cache_name": "cachedContent/doc",
            "claims": [make_claim("C001").model_dump()],
            "created_at": "2026-01-01T00:00:00Z",
        }

        with patch("sidecar_server.verify_all_claims", new_callable=AsyncMock,
                   return_value=[make_verdict("C001")]):
            resp = client.post("/verify/test-verify")
            assert resp.status_code == 200
            assert resp.json()["verdicts_complete"] == 1

        del analyses["test-verify"]
