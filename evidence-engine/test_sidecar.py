"""
Unit tests for Greenwash Lens Evidence Engine — Sprint 1.

Covers: health endpoint, upload endpoint, store lifecycle, cache lifecycle, error cases.

Run with: pytest test_sidecar.py -v
"""

import pytest
import os
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

os.environ.setdefault("GEMINI_API_KEY", "test-key-for-mocking")

from sidecar_server import app
from config import SYSTEM_PROMPT
from models import StatusResponse

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health_returns_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "2.0.0"
    assert "gemini_sdk" in data


# ---------------------------------------------------------------------------
# Upload — error cases (no Gemini API needed)
# ---------------------------------------------------------------------------

def test_upload_rejects_non_pdf():
    resp = client.post("/upload", files={"file": ("test.txt", b"hello", "text/plain")})
    assert resp.status_code == 400
    assert "PDF" in resp.json()["detail"]


def test_upload_rejects_no_file_extension():
    resp = client.post("/upload", files={"file": ("noext", b"%PDF-1.4 fake", "application/pdf")})
    assert resp.status_code == 400


def test_upload_accepts_pdf():
    """Upload a minimal valid-ish PDF (header only). Rely on mock for indexing."""
    with patch("sidecar_server.create_store_and_index", new_callable=AsyncMock) as mock_index:
        mock_index.return_value = "stores/test-company-2024-abc123"
        with patch("sidecar_server.create_document_cache") as mock_dc:
            mock_dc.return_value = "cachedContent/doc-test"
            with patch("sidecar_server.get_or_create_system_cache") as mock_sc:
                mock_sc.return_value = "cachedContent/system-v2"
                with patch("sidecar_server.extract_claims", new_callable=AsyncMock) as mock_ex:
                    mock_ex.return_value = []
                    with patch("sidecar_server.verify_all_claims", new_callable=AsyncMock) as mock_ve:
                        mock_ve.return_value = []

                pdf_bytes = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF"
                resp = client.post(
                    "/upload",
                    files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
                    data={"company": "TestCorp", "year": 2024, "language": "zh"},
                )

                assert resp.status_code == 200
                data = resp.json()
                assert "analysis_id" in data
                assert data["status"] == "indexing"
                assert len(data["analysis_id"]) > 0


def test_upload_too_large():
    """Test that files > 50MB are rejected before indexing."""
    with patch("sidecar_server.MAX_PDF_SIZE_BYTES", 1024):  # 1KB for test
        big = b"%PDF-1.4\n" + b"x" * 2048
        resp = client.post(
            "/upload",
            files={"file": ("big.pdf", big, "application/pdf")},
        )
        assert resp.status_code == 413


# ---------------------------------------------------------------------------
# Status polling
# ---------------------------------------------------------------------------

def test_status_404_for_unknown_id():
    resp = client.get("/status/nonexistent-id")
    assert resp.status_code == 404


def test_status_returns_progress_after_upload():
    """Simulate an upload, then poll status."""
    with patch("sidecar_server.create_store_and_index", new_callable=AsyncMock) as mock_index:
        mock_index.return_value = "stores/test-2024-xyz"
        with patch("sidecar_server.create_document_cache") as mock_dc:
            mock_dc.return_value = "cachedContent/doc-test"
            with patch("sidecar_server.get_or_create_system_cache") as mock_sc:
                mock_sc.return_value = "cachedContent/system-v2"
                with patch("sidecar_server.extract_claims", new_callable=AsyncMock) as mock_ex:
                    mock_ex.return_value = []
                    with patch("sidecar_server.verify_all_claims", new_callable=AsyncMock) as mock_ve:
                        mock_ve.return_value = []

                        resp = client.post(
                            "/upload",
                            files={"file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
                            data={"company": "C", "year": 2024},
                        )
                        analysis_id = resp.json()["analysis_id"]

                        resp = client.get(f"/status/{analysis_id}")
                        assert resp.status_code == 200
                        data = resp.json()
                        assert data["analysis_id"] == analysis_id
                        assert data["status"] in ("uploading", "indexing", "completed")
                        assert "progress" in data


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def test_cleanup_removes_analysis():
    with patch("sidecar_server.create_store_and_index", new_callable=AsyncMock) as mock_index:
        mock_index.return_value = "stores/test-2024-clean"
        with patch("sidecar_server.create_document_cache") as mock_dc:
            mock_dc.return_value = "cachedContent/doc-test"
            with patch("sidecar_server.get_or_create_system_cache") as mock_sc:
                mock_sc.return_value = "cachedContent/system-v2"
                with patch("sidecar_server.extract_claims", new_callable=AsyncMock) as mock_ex:
                    mock_ex.return_value = []
                    with patch("sidecar_server.verify_all_claims", new_callable=AsyncMock) as mock_ve:
                        mock_ve.return_value = []
                        with patch("sidecar_server.delete_store", new_callable=AsyncMock) as mock_del:
                            mock_del.return_value = True
                            with patch("sidecar_server.delete_cache") as mock_del_cache:
                                mock_del_cache.return_value = True

                                resp = client.post(
                                    "/upload",
                                    files={"file": ("r.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
                                )
                                analysis_id = resp.json()["analysis_id"]

                                # Wait for background task to complete
                                import time
                                time.sleep(1)

                                resp = client.post(f"/cleanup/{analysis_id}")
                                assert resp.status_code == 200
                                data = resp.json()
                                assert data["ok"] is True

                                # After cleanup, status should 404
                                resp = client.get(f"/status/{analysis_id}")
                                assert resp.status_code == 404


def test_cleanup_404_for_unknown_id():
    resp = client.post("/cleanup/nonexistent-id")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Context cache
# ---------------------------------------------------------------------------

def test_system_prompt_not_empty():
    """System prompt must be non-empty — it defines the analysis framework."""
    assert len(SYSTEM_PROMPT) > 200
    assert "supported" in SYSTEM_PROMPT
    assert "partially_supported" in SYSTEM_PROMPT
    assert "contradicted" in SYSTEM_PROMPT
    assert "insufficient_evidence" in SYSTEM_PROMPT


@patch("cache_manager._get_client")
def test_get_or_create_system_cache_creates_once(mock_get_client):
    from cache_manager import get_or_create_system_cache, _system_cache_name, delete_system_cache

    # Reset global state
    delete_system_cache()

    mock_client = MagicMock()
    mock_cache = MagicMock()
    mock_cache.name = "cachedContent/system-test-123"
    mock_client.caches.create.return_value = mock_cache
    mock_client.caches.get.return_value = mock_cache  # cache.get succeeds → cache still valid
    mock_get_client.return_value = mock_client

    # First call creates
    name1 = get_or_create_system_cache()
    assert name1 == "cachedContent/system-test-123"
    assert mock_client.caches.create.call_count == 1

    # Second call reuses (mock_get succeeds)
    name2 = get_or_create_system_cache()
    assert name2 == "cachedContent/system-test-123"
    assert mock_client.caches.create.call_count == 1  # No second create

    delete_system_cache()


@patch("cache_manager._get_client")
def test_create_document_cache(mock_get_client):
    from cache_manager import create_document_cache

    mock_client = MagicMock()
    mock_cache = MagicMock()
    mock_cache.name = "cachedContent/doc-test-456"
    mock_client.caches.create.return_value = mock_cache
    mock_get_client.return_value = mock_client

    name = create_document_cache("stores/test-2024-abc")
    assert name == "cachedContent/doc-test-456"
    mock_client.caches.create.assert_called_once()


# ---------------------------------------------------------------------------
# L1 Store — chunking selection
# ---------------------------------------------------------------------------

def test_chunking_selects_standard_for_normal_pdf():
    from l1_store import select_chunking_config
    # Create a temp file
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"x" * 8000)  # 8KB, 100 pages → density 0.08 (narrative)
        f.flush()
        cfg = select_chunking_config(f.name, page_count=100)
    os.unlink(f.name)
    assert cfg["max_tokens_per_chunk"] == 512  # narrative_heavy (capped at API limit)


def test_chunking_selects_data_heavy_for_dense_pdf():
    import tempfile
    from l1_store import select_chunking_config
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"x" * 20000)
        f.flush()
        cfg = select_chunking_config(f.name, page_count=10)  # density = 20/10 = 2
    os.unlink(f.name)
    assert cfg["max_tokens_per_chunk"] == 512  # narrative_heavy (capped at API limit)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b"x" * 100000)  # 100KB, 5 pages → density = 100/5 = 20
        f.flush()
        cfg = select_chunking_config(f.name, page_count=5)
    os.unlink(f.name)
    assert cfg["max_tokens_per_chunk"] == 350  # data_heavy (>15)


# ---------------------------------------------------------------------------
# Pydantic model validation
# ---------------------------------------------------------------------------

def test_status_response_serialization():
    s = StatusResponse(
        analysis_id="test-123",
        status="indexing",
        progress=50,
    )
    d = s.model_dump()
    assert d["analysis_id"] == "test-123"
    assert d["status"] == "indexing"
    assert d["progress"] == 50
    assert d["claims_found"] is None


def test_upload_response_serialization():
    from models import UploadResponse
    r = UploadResponse(
        analysis_id="test-456",
        status="indexing",
        store_name="stores/corp-2024-abc",
        estimated_duration="10-30s",
    )
    d = r.model_dump()
    assert d["analysis_id"] == "test-456"
    assert d["store_name"] == "stores/corp-2024-abc"
