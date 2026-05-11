const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { cleanPdfText } = require("./pdf-cleaner");

let popplerCheck = null;
let popplerAvailable = false;

function checkPoppler() {
  if (popplerCheck) return popplerCheck;
  popplerCheck = new Promise((resolve) => {
    execFile("pdftotext", ["-v"], { timeout: 5000 }, (error) => {
      popplerAvailable = !error;
      resolve(popplerAvailable);
    });
  });
  return popplerCheck;
}

async function extractWithPoppler(filePath) {
  const outPath = filePath + ".txt";
  await new Promise((resolve, reject) => {
    execFile("pdftotext", ["-layout", filePath, outPath], { timeout: 30000 }, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
  const text = await fs.readFile(outPath, "utf-8");
  await fs.unlink(outPath).catch(() => {});
  return text.trim();
}

async function extractWithPdfJs(filePath) {
  const pdfParse = require("pdf-parse");
  const dataBuffer = await fs.readFile(filePath);
  const result = await pdfParse(dataBuffer);
  return result.text.trim();
}

async function extractPdfText(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    throw Object.assign(new Error("PDF 文件为空。"), { statusCode: 400 });
  }

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
    } catch {
      popplerAvailable = false;
    }
  }

  try {
    const text = await extractWithPdfJs(filePath);
    return { text, engine: "pdfjs" };
  } catch (error) {
    const friendly = new Error(
      "无法提取 PDF 文字。请确认文件未加密、不是纯扫描图片，或尝试直接复制文字到输入框。",
    );
    friendly.statusCode = 422;
    throw friendly;
  }
}

async function extractFromBuffer(buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "greenwash-pdf-"));
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
