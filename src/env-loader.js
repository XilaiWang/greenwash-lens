const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(filePathOrUserDataDir = path.join(__dirname, "..", ".env")) {
  const filePath = resolveEnvPath(filePathOrUserDataDir);

  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();
    const rawValue = rawValueParts.join("=").trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveEnvPath(filePathOrUserDataDir) {
  if (!filePathOrUserDataDir) {
    return path.join(__dirname, "..", ".env");
  }

  if (path.extname(filePathOrUserDataDir) === ".env") {
    return filePathOrUserDataDir;
  }

  const candidate = path.join(filePathOrUserDataDir, ".env");
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  return path.join(__dirname, "..", ".env");
}

module.exports = {
  loadEnvFile,
};
