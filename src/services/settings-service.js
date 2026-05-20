const fs = require("node:fs");
const path = require("node:path");

const ALLOW_KEYS = new Set([
  "LLM_PROVIDER", "LLM_SECONDARY_PROVIDER", "LLM_TIMEOUT_MS",
  "OPENAI_API_KEY", "OPENAI_MODEL",
  "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL",
  "GEMINI_API_KEY", "GEMINI_MODEL",
  "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL",
]);

const PROVIDER_TO_KEY = {
  openai:   { apiKey: "OPENAI_API_KEY",   model: "OPENAI_MODEL" },
  claude:   { apiKey: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" },
  gemini:   { apiKey: "GEMINI_API_KEY",    model: "GEMINI_MODEL" },
  deepseek: { apiKey: "DEEPSEEK_API_KEY",  model: "DEEPSEEK_MODEL" },
};

const PROVIDER_LIST = ["openai", "claude", "gemini", "deepseek"];

const DEFAULT_MODELS = {
  openai: "gpt-4.1-mini",
  claude: "claude-3-5-haiku-latest",
  gemini: "gemini-3.1-flash-preview",
  deepseek: "deepseek-v4-flash",
};

function resolveEnvPath() {
  const root = process.env.GREENWASH_USER_DATA_DIR || path.resolve(__dirname, "..", "..");
  return path.join(root, ".env");
}

function readSettings() {
  const provider = process.env.LLM_PROVIDER || "none";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 30000);

  const providers = {};
  for (const p of PROVIDER_LIST) {
    const mapping = PROVIDER_TO_KEY[p];
    providers[p] = {
      configured: Boolean(process.env[mapping.apiKey]),
      model: process.env[mapping.model] || DEFAULT_MODELS[p],
    };
  }

  const secondaryProvider = process.env.LLM_SECONDARY_PROVIDER || "none";

  return { provider, secondaryProvider, timeoutMs, providers };
}

function writeSettings(updates) {
  if (!updates || typeof updates !== "object") {
    throw new Error("请求体必须是一个 JSON 对象");
  }

  const envPath = resolveEnvPath();
  const changedEnv = {};
  const prevGemini = Boolean(process.env.GEMINI_API_KEY);

  // provider
  if (updates.provider !== undefined) {
    const p = String(updates.provider).trim().toLowerCase();
    if (p !== "none" && !PROVIDER_TO_KEY[p]) {
      throw new Error(`无效的 provider: ${updates.provider}。可选: none, openai, claude, gemini, deepseek`);
    }
    changedEnv["LLM_PROVIDER"] = p;
  }

  // secondaryProvider
  if (updates.secondaryProvider !== undefined) {
    const p = String(updates.secondaryProvider).trim().toLowerCase();
    if (p !== "none" && !PROVIDER_TO_KEY[p]) {
      throw new Error(`无效的次要 provider: ${updates.secondaryProvider}。可选: none, openai, claude, gemini, deepseek`);
    }
    changedEnv["LLM_SECONDARY_PROVIDER"] = p;
  }

  // timeoutMs
  if (updates.timeoutMs !== undefined) {
    const t = Number(updates.timeoutMs);
    if (!Number.isFinite(t) || t < 1000 || t > 300000) {
      throw new Error("超时时间必须在 1000–300000 ms 之间");
    }
    changedEnv["LLM_TIMEOUT_MS"] = String(t);
  }

  // providers
  if (updates.providers && typeof updates.providers === "object") {
    for (const p of PROVIDER_LIST) {
      const entry = updates.providers[p];
      if (!entry || typeof entry !== "object") continue;
      const mapping = PROVIDER_TO_KEY[p];

      if (entry.apiKey !== undefined) {
        const val = String(entry.apiKey);
        if (val !== "") {
          changedEnv[mapping.apiKey] = val;
        }
        // empty string = keep existing, skip
      }
      if (entry.model !== undefined) {
        const val = String(entry.model).trim();
        if (val) changedEnv[mapping.model] = val;
      }
    }
  }

  if (Object.keys(changedEnv).length === 0) {
    return { ...readSettings(), geminiKeyChanged: false };
  }

  // Backup
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, envPath + ".backup");
  }

  // Read existing lines
  let lines = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  }

  // Replace or append
  const replaced = new Set();
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (changedEnv.hasOwnProperty(key)) {
      replaced.add(key);
      return `${key}=${changedEnv[key]}`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(changedEnv)) {
    if (!replaced.has(key)) {
      newLines.push(`${key}=${val}`);
    }
  }

  // Atomic write
  const tmpPath = envPath + ".tmp";
  fs.writeFileSync(tmpPath, newLines.join("\n") + "\n", "utf-8");
  fs.renameSync(tmpPath, envPath);

  // Update process.env immediately
  for (const [key, val] of Object.entries(changedEnv)) {
    process.env[key] = val;
  }

  const geminiKeyChanged = Boolean(process.env.GEMINI_API_KEY) !== prevGemini;

  return { ...readSettings(), geminiKeyChanged };
}

module.exports = { readSettings, writeSettings };
