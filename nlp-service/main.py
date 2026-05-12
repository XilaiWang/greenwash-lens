from typing import Optional

from fastapi import FastAPI
from langdetect import DetectorFactory, detect
from pydantic import BaseModel

DetectorFactory.seed = 0

app = FastAPI(title="Greenwash Lens NLP Service", version="0.9.0")

EMOTIONAL_DICT = {
    "刻不容缓": 3,
    "生死存亡": 3,
    "最后机会": 3,
    "迫在眉睫": 3,
    "地球危机": 3,
    "气候紧急": 3,
    "为了子孙": 2,
    "下一代": 2,
    "我们的孩子": 2,
    "共同责任": 2,
    "守护地球": 2,
    "你的选择": 2,
    "从我做起": 2,
    "绿色未来": 1,
    "美好家园": 1,
    "自然之选": 1,
    "引领变革": 1,
    "碳排放": 0,
    "可再生能源": 0,
    "第三方认证": 0,
}

sentiment_pipeline = None
commitment_pipeline = None
specificity_pipeline = None
zh_tokenizer = None
zh_model = None
model_load_error: Optional[str] = None


class AnalyzeRequest(BaseModel):
    text: str
    language: str = "auto"


@app.on_event("startup")
def load_models():
    global sentiment_pipeline
    global commitment_pipeline
    global specificity_pipeline
    global zh_tokenizer
    global zh_model
    global model_load_error

    errors = []

    def safe_load(name, loader):
        try:
            return loader()
        except Exception as e:
            errors.append(f"{name}: {e}")
            return None

    from transformers import AutoModel, AutoTokenizer, pipeline

    sentiment_pipeline = safe_load("climate-sentiment", lambda: pipeline(
        "text-classification",
        model="climatebert/distilroberta-base-climate-sentiment",
    ))
    commitment_pipeline = safe_load("climate-commitment", lambda: pipeline(
        "text-classification",
        model="climatebert/distilroberta-base-climate-commitment",
    ))
    specificity_pipeline = safe_load("climate-specificity", lambda: pipeline(
        "text-classification",
        model="climatebert/distilroberta-base-climate-specificity",
    ))
    zh_tokenizer = safe_load("zh-tokenizer", lambda: AutoTokenizer.from_pretrained(
        "hfl/chinese-roberta-wwm-ext",
    ))
    zh_model = safe_load("zh-model", lambda: AutoModel.from_pretrained(
        "hfl/chinese-roberta-wwm-ext",
    ))

    model_load_error = "; ".join(errors) if errors else None


@app.get("/health")
def health():
    return {
        "ok": model_load_error is None,
        "models_loaded": model_load_error is None,
        "error": model_load_error or None,
    }


@app.post("/analyze")
def analyze(payload: AnalyzeRequest):
    text = (payload.text or "").strip()
    language = normalize_language(payload.language, text)

    if not text:
        return build_empty_result(language)

    if language == "zh":
        return analyze_chinese(text, language)

    if model_load_error:
        return analyze_rule_fallback(text, language)

    try:
        return analyze_climatebert(text, language)
    except Exception:
        return analyze_rule_fallback(text, language)


def normalize_language(language: str, text: str) -> str:
    value = (language or "auto").lower()
    if value in ["zh", "en", "mixed"]:
        return value

    try:
        detected = detect(text)
    except Exception:
        detected = "unknown"

    cjk_chars = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
    latin_chars = sum(1 for char in text if char.isascii() and char.isalpha())

    if cjk_chars and latin_chars:
        return "mixed"
    if detected.startswith("zh") or cjk_chars > latin_chars:
        return "zh"
    return "en"


def analyze_chinese(text: str, language: str):
    matched_score = 0
    for phrase, score in EMOTIONAL_DICT.items():
        if phrase in text:
            matched_score += score

    token_units = max(len([char for char in text if not char.isspace()]), 1)
    emotion_score = clamp((matched_score / max(token_units / 20, 1)) * 20, 0, 100)

    return {
        "climateSentiment": "neutral",
        "sentimentConfidence": 0,
        "isCommitment": False,
        "commitmentType": "no commitment",
        "specificityScore": 0.5,
        "emotionScore": round(emotion_score),
        "language": language,
    }


def analyze_climatebert(text: str, language: str):
    sentiment = first_result(sentiment_pipeline(text, truncation=True, max_length=512))
    commitment = first_result(commitment_pipeline(text, truncation=True, max_length=512))
    specificity = first_result(specificity_pipeline(text, truncation=True, max_length=512))

    climate_sentiment = normalize_sentiment(sentiment.get("label"))
    commitment_type = normalize_commitment(commitment.get("label"))
    specificity_score = normalize_specificity(specificity)

    return {
        "climateSentiment": climate_sentiment,
        "sentimentConfidence": float(sentiment.get("score") or 0),
        "isCommitment": commitment_type == "commitment",
        "commitmentType": commitment_type,
        "specificityScore": specificity_score,
        "emotionScore": round(climate_emotion_score(climate_sentiment, specificity_score)),
        "language": language,
    }


def first_result(value):
    if isinstance(value, list) and value:
        return value[0]
    return {}


def normalize_sentiment(label):
    value = str(label or "neutral").lower()
    if "opportunity" in value:
        return "opportunity"
    if "risk" in value:
        return "risk"
    return "neutral"


def normalize_commitment(label):
    value = str(label or "no commitment").lower()
    return "commitment" if "commitment" in value and "no" not in value else "no commitment"


def normalize_specificity(result):
    label = str(result.get("label") or "").lower()
    score = float(result.get("score") or 0.5)
    if "non" in label or "vague" in label or "not" in label:
        return round(1 - score, 4)
    if "specific" in label:
        return round(score, 4)
    return round(score, 4)


def climate_emotion_score(sentiment, specificity_score):
    sentiment_map = {"opportunity": 70, "neutral": 30, "risk": 15}
    specificity_penalty = (1 - specificity_score) * 40
    return clamp(sentiment_map.get(sentiment, 30) * 0.6 + specificity_penalty * 0.4, 0, 100)


def analyze_rule_fallback(text: str, language: str):
    matched_score = 0
    for phrase, score in EMOTIONAL_DICT.items():
        if phrase.lower() in text.lower():
            matched_score += score
    token_units = max(sum(1 for c in text if not c.isspace()), 1)
    emotion_score = clamp((matched_score / max(token_units / 20, 1)) * 20, 0, 100)

    return {
        "climateSentiment": "neutral",
        "sentimentConfidence": 0,
        "isCommitment": False,
        "commitmentType": "no commitment",
        "specificityScore": 0.5,
        "emotionScore": round(emotion_score),
        "language": language,
        "fallback": True,
    }


def build_empty_result(language):
    return {
        "climateSentiment": "neutral",
        "sentimentConfidence": 0,
        "isCommitment": False,
        "commitmentType": "no commitment",
        "specificityScore": 0.5,
        "emotionScore": 0,
        "language": language,
    }


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=5174)
