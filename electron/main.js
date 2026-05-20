const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  BrowserWindow,
  Menu,
  Tray,
  app,
  nativeImage,
} = require("electron");
const { loadEnvFile } = require("../src/env-loader");

let mainWindow = null;
let tray = null;
let backend = null;
let nlpProcess = null;
let evidenceSidecar = null;
let quitting = false;

const APP_NAME = "Greenwashing Lens";
const trayIconPath = path.join(__dirname, "assets", "icon.png");

app.name = APP_NAME;
app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId("com.greenwashinglens.desktop");
}

app.whenReady().then(async () => {
  const userDataDir = app.getPath("userData");
  process.env.GREENWASH_USER_DATA_DIR = userDataDir;
  process.env.ALLOW_FILE_ORIGIN = "1";
  ensureDesktopEnvTemplate(userDataDir);
  loadEnvFile(userDataDir);

  startNlpService();
  startEvidenceEngine();

  const { startServer } = require("../server");
  backend = await startServer({
    host: "127.0.0.1",
    port: 0,
    silent: true,
    allowFileOrigin: true,
  });

  createMainWindow(`${backend.url}?desktop=1`);
  createTray();

  app.on("activate", () => {
    if (!mainWindow) {
      createMainWindow(`${backend.url}?desktop=1`);
      return;
    }

    mainWindow.show();
    mainWindow.focus();
  });
});

app.on("before-quit", async () => {
  quitting = true;

  stopNlpService();
  stopEvidenceEngine();

  if (backend?.server) {
    await new Promise((resolve) => backend.server.close(resolve));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && quitting) {
    app.quit();
  }
});

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: trayIconPath,
    autoHideMenuBar: true,
    backgroundColor: "#f5f7f8",
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.on("close", (event) => {
    if (quitting || !tray) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(trayIconPath).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示窗口",
        click: () => {
          if (!mainWindow) {
            createMainWindow(`${backend.url}?desktop=1`);
          }

          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: "退出",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => {
    if (!mainWindow) {
      createMainWindow(`${backend.url}?desktop=1`);
    }

    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function resolveNlpServiceDir() {
  const candidate = path.join(__dirname, "..", "nlp-service");
  // ASAR-internal paths cannot be spawned — OS doesn't understand the virtual FS
  if (!candidate.includes(".asar") && fs.existsSync(path.join(candidate, "main.py"))) {
    return candidate;
  }
  const altPath = path.join(app.getPath("userData"), "nlp-service");
  if (fs.existsSync(path.join(altPath, "main.py"))) {
    return altPath;
  }
  return null;
}

function startNlpService() {
  const serviceDir = resolveNlpServiceDir();
  if (!serviceDir) {
    console.log("NLP service directory not found, skipping.");
    return;
  }

  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  nlpProcess = spawn(pythonCmd, ["main.py"], {
    cwd: serviceDir,
    stdio: ["ignore", "ignore", "pipe"],
  });

  nlpProcess.on("error", () => {
    nlpProcess = null;
  });

  nlpProcess.on("exit", (code) => {
    if (!quitting && code !== 0) {
      console.warn(`NLP service exited with code ${code}`);
    }
    nlpProcess = null;
  });

  if (nlpProcess.stderr) {
    nlpProcess.stderr.on("data", () => {});
  }
}

function stopNlpService() {
  if (!nlpProcess) return;
  try {
    nlpProcess.kill();
  } catch {
    // Process already dead
  }
  nlpProcess = null;
}

function resolveEvidenceEngineDir() {
  const candidate = path.join(__dirname, "..", "evidence-engine");
  // ASAR-internal paths cannot be spawned — OS doesn't understand the virtual FS
  if (!candidate.includes(".asar") && fs.existsSync(path.join(candidate, "sidecar_server.py"))) {
    return candidate;
  }
  const altPath = path.join(app.getPath("userData"), "evidence-engine");
  if (fs.existsSync(path.join(altPath, "sidecar_server.py"))) {
    return altPath;
  }
  return null;
}

function startEvidenceEngine() {
  const serviceDir = resolveEvidenceEngineDir();
  if (!serviceDir) {
    console.log("Evidence engine directory not found, skipping.");
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY not set, evidence engine disabled.");
    return;
  }

  // Check if sidecar already running (e.g. started by deploy script)
  const net = require("node:net");
  const sock = new net.Socket();
  sock.setTimeout(500);
  sock.on("error", () => {
    // Port free — start sidecar
    sock.destroy();
    spawnSidecarProcess(serviceDir);
  });
  sock.on("connect", () => {
    // Already running
    sock.destroy();
    console.log("Evidence engine already running on port 5176.");
  });
  sock.connect(5176, "127.0.0.1");
}

function spawnSidecarProcess(serviceDir) {
  const venvPython = path.join(serviceDir, ".venv", "bin", "python3");
  const pythonCmd = fs.existsSync(venvPython) ? venvPython
    : (process.platform === "win32" ? "python" : "python3");
  evidenceSidecar = spawn(pythonCmd, ["-m", "uvicorn", "sidecar_server:app",
    "--host", "127.0.0.1",
    "--port", "5176",
  ], {
    cwd: serviceDir,
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      PHASE1_API_URL: backend ? backend.url : "http://127.0.0.1:5173",
    },
  });

  evidenceSidecar.on("error", () => {
    evidenceSidecar = null;
  });

  evidenceSidecar.on("exit", (code) => {
    if (!quitting && code !== 0) {
      console.warn(`Evidence engine exited with code ${code}`);
    }
    evidenceSidecar = null;
  });

  if (evidenceSidecar.stderr) {
    evidenceSidecar.stderr.on("data", (chunk) => {
      console.warn("[evidence-engine]", chunk.toString().trim());
    });
  }
}

function stopEvidenceEngine() {
  if (!evidenceSidecar) return;
  try {
    evidenceSidecar.kill();
  } catch {
    // Process already dead
  }
  evidenceSidecar = null;
}

function ensureDesktopEnvTemplate(userDataDir) {
  const envPath = path.join(userDataDir, ".env");
  const templatePath = path.join(__dirname, "..", ".env.example");

  fs.mkdirSync(userDataDir, { recursive: true });

  if (!fs.existsSync(envPath) && fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, envPath);
  }

  console.log(`Greenwashing Lens desktop env file: ${envPath}`);
}
