from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from enum import Enum


class ClaimType(str, Enum):
    PRODUCT = "P"
    DISCLOSURE = "D"
    COMMITMENT = "C"


class Verdict(str, Enum):
    SUPPORTED = "supported"
    PARTIALLY_SUPPORTED = "partially_supported"
    CONTRADICTED = "contradicted"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class GapSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AnalysisStatus(str, Enum):
    UPLOADING = "uploading"
    INDEXING = "indexing"
    EXTRACTING = "extracting"
    VERIFYING = "verifying"
    BATCH_SUBMITTED = "batch_submitted"
    AGGREGATING = "aggregating"
    COMPLETED = "completed"
    FAILED = "failed"


# --- Upload ---

class UploadRequest(BaseModel):
    company: str = "unknown"
    year: int = 2024
    report_type: str = "esg_report"
    language: str = "zh"


class UploadResponse(BaseModel):
    analysis_id: str
    status: str
    store_name: str
    estimated_duration: str


# --- Status ---

class StatusResponse(BaseModel):
    analysis_id: str
    status: str
    progress: int = 0
    claims_found: Optional[int] = None
    verdicts_complete: Optional[int] = None
    error: Optional[str] = None


# --- Claims ---

class Claim(BaseModel):
    claim_id: str
    claim_text: str = Field(max_length=300)
    page_number: int
    source_section: str
    claim_type: ClaimType
    claim_subtypes: List[str] = []
    verifiable_facts: List[str] = []
    language_analysis: Optional[dict] = None


class ClaimExtractionResult(BaseModel):
    claims: List[Claim]


# --- Evidence ---

class EvidenceQuery(BaseModel):
    query_id: str
    query_text: str
    query_purpose: Literal[
        "数值验证", "基线验证", "边界验证",
        "方法验证", "可验证性", "一致性验证"
    ]


class SupportingChunk(BaseModel):
    chunk_text: str
    page_number: Optional[int] = None
    relevance_score: float = Field(ge=0, le=1)
    supports: str


class EvidenceGap(BaseModel):
    gap_type: str
    description: str
    severity: GapSeverity
    reason: str


class ClaimVerdict(BaseModel):
    claim_id: str
    verdict: Verdict
    confidence: float = Field(ge=0, le=1)
    evidence_risk_score: float = Field(ge=0, le=100)
    supporting_evidence: List[SupportingChunk] = []
    contradicting_evidence: List[SupportingChunk] = []
    evidence_gaps: List[EvidenceGap] = []


# --- Document Report ---

class DocumentReport(BaseModel):
    company: str
    report_year: int
    analysis_id: str
    analysis_timestamp: str
    total_claims: int
    claims: List[dict] = []
    scoring: dict = {}
    key_findings: List[str] = []
    highest_risk_claims: List[dict] = []
