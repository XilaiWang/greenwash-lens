const BODY_LIMIT = 200 * 1024;
const PDF_BODY_LIMIT = 20 * 1024 * 1024;

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    request.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > BODY_LIMIT) {
        const error = new Error("请求文本过长。");
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const rawBody = Buffer.concat(chunks, totalLength).toString("utf-8");
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        const error = new Error("请求格式不是有效 JSON。");
        error.statusCode = 400;
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function readRawBody(request, limit = PDF_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    request.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > limit) {
        const error = new Error("PDF 文件过大，请上传 20MB 以内的文件。");
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks, totalLength));
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

module.exports = {
  PDF_BODY_LIMIT,
  readJson,
  readRawBody,
  sendJson,
  sendText,
};
