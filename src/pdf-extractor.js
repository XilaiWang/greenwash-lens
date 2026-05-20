const { execFile, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { cleanPdfText } = require("./pdf-cleaner");

let popplerCheck = null;
let popplerAvailable = false;
let popplerBinary = null;

function checkPoppler() {
  if (popplerCheck) return popplerCheck;
  popplerCheck = new Promise((resolve) => {
    const candidate = resolvePopplerBinary();
    if (!candidate) {
      popplerAvailable = false;
      resolve(false);
      return;
    }

    execFile(candidate, ["-v"], { timeout: 5000 }, (error) => {
      popplerAvailable = !error;
      if (popplerAvailable) {
        popplerBinary = candidate;
      }
      resolve(popplerAvailable);
    });
  });
  return popplerCheck;
}

async function extractWithPoppler(filePath) {
  const outPath = filePath + ".txt";
  const binary = popplerBinary || resolvePopplerBinary();

  if (!binary) {
    throw new Error("pdftotext-not-found");
  }

  await new Promise((resolve, reject) => {
    execFile(binary, [filePath, outPath], { timeout: 30000 }, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
  const text = await fs.readFile(outPath, "utf-8");
  await fs.unlink(outPath).catch(() => {});
  return normalizeExtractedText(text);
}

async function extractWithPdfJs(filePath) {
  const pdfParse = require("pdf-parse");
  const dataBuffer = await fs.readFile(filePath);
  const result = await pdfParse(dataBuffer);
  return normalizeExtractedText(result.text);
}

async function extractPdfText(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    throw Object.assign(new Error("PDF 文件为空。"), { statusCode: 400 });
  }

  let popplerError = null;
  let pdfjsError = null;

  try {
    await checkPoppler();
  } catch {
    popplerAvailable = false;
  }

  if (popplerAvailable) {
    try {
      const text = await extractWithPoppler(filePath);
      if (text) {
        return { text, engine: "poppler" };
      }
      popplerError = new Error("poppler-empty-text");
    } catch (error) {
      popplerError = error;
    }
  }

  try {
    const text = await extractWithPdfJs(filePath);
    if (text) {
      return { text, engine: "pdfjs" };
    }
    pdfjsError = new Error("pdfjs-empty-text");
  } catch (error) {
    pdfjsError = error;
  }

  const noExtractableText = [popplerError, pdfjsError]
    .filter(Boolean)
    .some((error) => String(error.message || "").includes("empty-text"));

  const friendly = new Error(
    noExtractableText
      ? "这个 PDF 中没有检测到可提取文字。它可能是扫描件、图片型 PDF，或文字位于不可复制的图层中。"
      : "无法提取 PDF 文字。请确认文件未加密、不是纯扫描图片，或尝试直接复制文字到输入框。",
  );
  friendly.statusCode = 422;
  throw friendly;
}

async function extractFromBuffer(buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "greenwashing-pdf-"));
  const tmpFile = path.join(tmpDir, "upload.pdf");

  try {
    await fs.writeFile(tmpFile, buffer);
    const { text: rawText, engine } = await extractPdfText(tmpFile);
    const { cleanedText, document, warnings, stats } = cleanPdfText(rawText);
    return { rawText, text: cleanedText, document, engine, warnings, stats };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  extractPdfText,
  extractFromBuffer,
};

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim();
}

function resolvePopplerBinary() {
  if (popplerBinary) return popplerBinary;

  const candidates = [
    process.env.PDFTOTEXT_PATH,
    discoverViaShell(),
    "/opt/homebrew/bin/pdftotext",
    "/usr/local/bin/pdftotext",
    "/opt/anaconda3/bin/pdftotext",
    "/usr/bin/pdftotext",
    "pdftotext",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "pdftotext") {
      popplerBinary = candidate;
      return candidate;
    }

    try {
      require("node:fs").accessSync(candidate);
      popplerBinary = candidate;
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function discoverViaShell() {
  const shell = process.env.SHELL || "/bin/zsh";

  try {
    const result = spawnSync(shell, ["-lc", "command -v pdftotext"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const resolved = String(result.stdout || "").trim();
    return resolved || null;
  } catch {
    return null;
  }
}
