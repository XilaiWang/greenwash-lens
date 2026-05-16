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
        applyApiCors({
          request,
          response,
          allowFileOrigin,
          port: boundPort,
        });
      }

      if (isApiRequest && request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (await handleApi(request, response, url)) {
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

  if (!options.sillent) {
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

  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

  response.writeHead(200, {
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    "Content-Type": contentType,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  response.end(await fs.readFile(filePath));
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
