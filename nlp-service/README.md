# Greenwash Lens NLP Service

This optional Python service adds Layer 2 NLP emotion analysis to Greenwash Lens.

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

Greenwash Lens works normally when this service is not running. When available, the main app automatically includes it in the three-layer emotion analysis.
