# Greenwashing Lens NLP Service

This optional Python service adds Layer 2 NLP emotion analysis to Greenwashing Lens.

## Install

```bash
cd nlp-service
pip install -r requirements.txt
```

The first run downloads about 500MB of Hugging Face models. Models are cached in:

```text
~/.cache/huggingface/
```

## Run

```bash
python main.py
```

or:

```bash
./start.sh
```

The service listens on:

```text
http://127.0.0.1:5174
```

If the service starts correctly, opening the health address in a browser should show a JSON response with `ok: true`.

```text
http://127.0.0.1:5174/health
```

## Common startup issues

- If `uvicorn` cannot be found, use `python3 -m uvicorn` or run `./start.sh`.
- If your machine has multiple Python installations, `./start.sh` will try to pick one that already has `uvicorn`, `fastapi`, `transformers`, `torch`, and `langdetect` installed.
- If model download fails on first run, check that the machine can access Hugging Face and try again.
- If the service starts but `ok` is `false`, one or more models did not load correctly. Restart once after the first download completes.
- Greenwashing Lens can still be used without this service. The app will automatically fall back to the rule layer and LLM layer.

Greenwashing Lens works normally when this service is not running. When available, the main app automatically includes it in the three-layer emotion analysis.
