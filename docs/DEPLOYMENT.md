# Deployment

## Development Mode

1. Install Node.js 18 or later.
2. Open this project folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://127.0.0.1:5173`.

## Custom Port

```bash
PORT=8080 npm start
```

## LAN Access

If you want another device on the same network to open the app:

```bash
HOST=0.0.0.0 PORT=5173 npm start
```

Then open the host machine's local network IP address with port `5173`.

## Desktop Packaging

Generate a development package directory:

```bash
npm run build
```

Generate installable desktop artifacts:

```bash
npm run package
```

Artifacts are written to:

```text
dist/
```

## Data Storage

In desktop mode, analysis history is stored in SQLite inside the OS user data directory.

macOS:

```text
~/Library/Application Support/Greenwashing Lens/history.sqlite
```

Windows:

```text
%APPDATA%\Greenwashing Lens\history.sqlite
```

In development mode without Electron, the fallback location is:

```text
data/history.sqlite
```

On first launch, the app will import old `history.json` data if present.

## External LLM API

Create a `.env` file in the project root. Use `.env.example` as the template.

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

For Claude:

```text
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

For Gemini:

```text
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

For DeepSeek:

```text
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
```

Restart the app after changing `.env`.
