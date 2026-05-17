# Greenwash Lens — Evidence Engine (Python Sidecar)

L1→L4 PDF claim verification pipeline. Uses Gemini File Search to index
documents, extract verifiable ESG claims, retrieve supporting evidence
across multiple targeted queries, and adjudicate each claim's verdict
(supported / partial / contradicted / insufficient_evidence).

Runs as a separate Python process on port **5176**. The Node backend on
port 5173 proxies `/api/evidence/*` requests to it.

## Architecture

| Layer | Module | Purpose |
|---|---|---|
| L1 | [l1_store.py](l1_store.py) | Upload PDF → Gemini File Search Store; chooses chunking strategy (data_heavy / standard_esg / narrative_heavy) by content density |
| L2 | [l2_extractor.py](l2_extractor.py) | Prompts Gemini Flash + File Search to extract 15–30 atomic ESG claims with `claim_type` (P/D/C), `page_number`, `verifiable_facts` |
| L2.5 | [phase1_client.py](phase1_client.py) | Bridges back to Node `/api/deep-analyze` to populate each claim's `language_analysis` (M3/M4/M5/TGRI) |
| L3 | [l3_verifier.py](l3_verifier.py) | Per claim: generate 3-5 verification queries (numeric / baseline / boundary / method / evidence), parallel retrieve top_k=5 chunks, dedupe, adjudicate with exponential backoff retries |
| L4 | [sidecar_server.py](sidecar_server.py) | Aggregate claims + verdicts → `DocumentReport { text_risk, evidence_risk, document_GRI, risk_level, key_findings, highest_risk_claims }` |

## Required environment

- Python ≥ 3.10
- `GEMINI_API_KEY` env var (from <https://aistudio.google.com/apikey>)
- Optional: `PHASE1_API_URL` (defaults to `http://127.0.0.1:5173`)

## Setup (one-time)

```bash
cd evidence-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
# from project root
export GEMINI_API_KEY="your_key_here"
cd evidence-engine
source .venv/bin/activate
./start.sh     # → http://127.0.0.1:5176
```

Or run directly:

```bash
python -m uvicorn sidecar_server:app --host 127.0.0.1 --port 5176
```

In production (Electron desktop app), `electron/main.js` auto-spawns this
sidecar when `GEMINI_API_KEY` is set. See
[`electron/main.js:startEvidenceEngine`](../electron/main.js:213).

## HTTP API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status check + Gemini SDK version |
| POST | `/upload` | Upload PDF (multipart), start indexing |
| GET | `/status/{analysis_id}` | Poll progress (uploading→indexing→extracting→verifying→completed) |
| POST | `/extract/{analysis_id}` | Manually trigger L2 extraction |
| POST | `/verify/{analysis_id}` | Real-time L3 verification (~60s) |
| POST | `/verify-batch/{analysis_id}` | Async batch L3 verification (~15min, half cost) |
| GET | `/batch-status/{analysis_id}` | Poll batch verification |
| GET | `/report/{analysis_id}` | Final L4 `DocumentReport` JSON |
| POST | `/cleanup/{analysis_id}` | Delete File Search Store + caches |

All proxied through the Node backend at `/api/evidence/*` (see
[`src/api-router.js:256`](../src/api-router.js:256)).

## Costs (Gemini 2.5 Flash, 2026-Q1 pricing)

- L1 indexing: ~$0.05 per typical 30-page PDF
- L2 extraction: ~$0.10
- L3 verification (realtime): ~$0.50 (15 claims × 4 queries × multi-step retrieval)
- L3 verification (batch): ~$0.25 (50% discount, async)
- L4 aggregation: ~$0.05

**Total per ESG report: $0.70 (realtime) or $0.45 (batch).**

## Tests

```bash
pytest test_sidecar.py test_sprint2.py test_sprint3.py
```

## Known limitations

- Gemini File Search is rate-limited (currently 60 requests/min on free tier)
- Maximum PDF size: 50 MB
- L3 adjudication uses temperature 0.2 — minor variance between runs is expected
- Stateless: results held in-memory (max 100 active analyses); no DB persistence (use Node `/api/history` for that)
