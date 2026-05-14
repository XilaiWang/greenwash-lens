const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const { loadEnvFile } = require("./src/env-loader");

loadEnvFile();

const { handleApi } = require("./src/api-router");
const { sendJson, sendText } = require("./src/http-utils");

const DEFAULT_HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = path.join(__dirname, "public");

const CSRF_TOKEN = crypto.randomBytes(32).toString("hex");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function createServer(options = {}) {
  const allowFileOrigin =
    options.allowFileOrigin ??
    (process.env.ALLOW_FILE_ORIGIN === "1" || Boolean(process.versions.electron));
  let boundPort = null;

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const isApiRequest = url.pathname.startsWith("/api/");

      if (isApiRequest) {
        const originAllowed = applyApiCors({
          request,
          response,
          allowFileOrigin,
          port: boundPort,
        });

        if ((request.method === "POST" || request.method === "DELETE") && !originAllowed) {
          sendJson(response, 403, { error: "不允许跨站点请求。请从本应用内发起操作。" });
          return;
        }
      }

      if (isApiRequest && request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (await handleApi(request, response, url, CSRF_TOKEN)) {
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendText(response, 405, "Method Not Allowed");
        return;
      }

      await serveStaticFile(request, response, url.pathname);
    } catch (error) {
      const status = error.statusCode || 500;
      const message = status >= 500 ? "应用服务出现异常。" : error.message;

      if (!response.headersSent) {
        sendJson(response, status, { error: message });
      }
    }
  });

  server.on("listening", () => {
    const address = server.address();
    boundPort = typeof address === "object" && address ? address.port : null;
  });

  return server;
}

async function startServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const server = createServer(options);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;

  if (!options.silent) {
    console.log(`Greenwash Lens is running at ${url}`);
  }

  return {
    server,
    host,
    port: actualPort,
    url,
  };
}

function applyApiCors({ request, response, allowFileOrigin, port }) {
  const origin = request.headers.origin;
  const allowedOrigins = new Set();

  if (port) {
    allowedOrigins.add(`http://127.0.0.1:${port}`);
    allowedOrigins.add(`http://localhost:${port}`);
  }

  if (allowFileOrigin) {
    allowedOrigins.add("file://");
    allowedOrigins.add("null");
  }

  const originAllowed = !origin || allowedOrigins.has(origin);

  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");

  return originAllowed;
}

async function serveStaticFile(request, response, pathname) {
  const safePathname = decodeURIComponent(pathname);
  const relativePath = safePathname === "/" ? "index.html" : safePathname.replace(/^\/+/, "");
  const absolutePath = path.resolve(PUBLIC_DIR, relativePath);
  const relativeToPublic = path.relative(PUBLIC_DIR, absolutePath);

  if (relativeToPublic.startsWith("..") || path.isAbsolute(relativeToPublic)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  let filePath = absolutePath;

  let stat;

  try {
    stat = await fs.stat(filePath);
  } catch {
    sendText(response, 404, "Not Found");
    return;
  }

  if (stat.isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  const isHtml = extension === ".html";

  const headers = {
    "Cache-Control": isHtml ? "no-cache" : "public, max-age=3600",
    "Content-Type": contentType,
  };

  if (isHtml) {
    const csp = [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' http://127.0.0.1:* http://localhost:*",
      "img-src 'self' data:",
      "font-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; ");
    headers["Content-Security-Policy"] = csp;
  }

  response.writeHead(200, headers);

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  let content = await fs.readFile(filePath);

  if (isHtml) {
    content = String(content).replace(
      "<head>",
      `<head>\n    <meta name="csrf-token" content="${CSRF_TOKEN}" />`,
    );
  }

  response.end(content);
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  startServer,
};
