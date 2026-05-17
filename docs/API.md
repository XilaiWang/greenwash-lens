# API

## GET /api/health

新版等价路径：`GET /api/v1/health`

检查应用服务是否可用。

```json
{
  "ok": true,
  "app": "greenwashing-lens",
  "apiVersion": "v1",
  "engineVersion": "engine-core-0.9.0",
  "storage": {
    "type": "sqlite",
    "directory": "/path/to/storage-dir",
    "file": "/path/to/storage-dir/history.sqlite"
  },
  "llmService": {
    "provider": "deepseek",
    "enabled": true,
    "model": "deepseek-v4-flash"
  },
  "nlpService": {
    "available": false,
    "url": "http://127.0.0.1:5174"
  }
}
```

## POST /api/analyze

新版等价路径：`POST /api/v1/analyze`

分析一段文本的 greenwashing 风险。

请求：

```json
{
  "text": "我们致力于打造更绿色的未来。",
  "contextType": "auto",
  "sector": "auto"
}
```

响应：

```json
{
  "result": {
    "risk": 92,
    "claimProb": 100,
    "confidence": 65,
    "level": "高风险",
    "tone": "red",
    "summary": "该文本包含明显绿色声明，但证据、边界或行动支撑不足，建议优先进入人工核验。",
    "emotionAnalysis": {
      "finalScore": 58,
      "level": "medium",
      "consistency": 82,
      "layersUsed": 2,
      "breakdown": {
        "rule": 0,
        "nlp": null,
        "llm": 72
      },
      "nlpDetail": null
    }
  },
  "emotionAnalysis": {
    "finalScore": 58,
    "level": "medium",
    "consistency": 82,
    "layersUsed": 2
  },
  "meta": {
    "apiVersion": "v1",
    "app": "greenwashing-lens",
    "engineVersion": "engine-core-0.9.0",
    "generatedAt": "2026-05-11T00:00:00.000Z"
  }
}
```

`contextType` 和 `sector` 可以使用 `auto` 自动识别，也可以使用具体值手动覆盖。
`text` 必须是非空字符串，且长度不能超过 `10000` 个字符。

## POST /api/v1/classify

只识别输入文本的语言、文本场景和行业。

请求：

```json
{
  "text": "Our new apparel collection uses recycled polyester and lower-impact packaging.",
  "contextType": "auto",
  "sector": "auto"
}
```

响应：

```json
{
  "classification": {
    "language": {
      "value": "en",
      "label": "英文",
      "confidence": 1
    },
    "context": {
      "selected": "product",
      "source": "auto",
      "label": "产品描述"
    },
    "sector": {
      "selected": "fashion",
      "source": "auto",
      "label": "服装/零售"
    }
  }
}
```

## GET /api/v1/services

查看模块化服务入口和 LLM 适配器状态。后续接入大模型时，主要扩展 `src/services/llm-service.js`。

## POST /api/v1/llm/test

测试当前外部模型 API 配置是否可用。

配置来自 `.env` 或系统环境变量：

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

支持的 provider：

- `openai`: OpenAI Responses API
- `claude`: Anthropic Messages API
- `gemini`: Gemini generateContent API
- `deepseek`: DeepSeek OpenAI-compatible chat completions API

## Layer 2 NLP 子服务

可选 Python 子服务地址：

```text
http://127.0.0.1:5174
```

启动后，`POST /api/v1/analyze` 会自动把 Layer 1 规则引擎、Layer 2 NLP 子服务、Layer 3 LLM 的情绪判断融合到 `emotionAnalysis`。不启动时主应用仍正常运行，`emotionAnalysis.breakdown.nlp` 返回 `null`。

Python 子服务端点：

- `GET /health`
- `POST /analyze`

请求：

```json
{
  "text": "We are committed to a sustainable future.",
  "language": "en"
}
```

响应：

```json
{
  "climateSentiment": "opportunity",
  "sentimentConfidence": 0.87,
  "isCommitment": true,
  "commitmentType": "commitment",
  "specificityScore": 0.23,
  "emotionScore": 65,
  "language": "en"
}
```

## GET /api/history

读取最近分析历史。支持 `limit` 参数，范围 `1-1000`。

## POST /api/v1/analyze-jobs

创建异步分析任务，适合较慢的外部模型调用场景。

如果任务运行中 8 秒内没有新进度，接口会主动把任务状态标记为 `stalled`，方便前端提示用户当前卡在等待阶段。

## DELETE /api/history

清空本地历史记录。

## DELETE /api/v1/history/:id

删除单条历史记录。
