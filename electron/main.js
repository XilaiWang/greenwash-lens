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
let quitting = false;

const APP_NAME = "Greenwash Lens";
const trayIconPath = path.join(__dirname, "assets", "icon.png");

app.name = APP_NAME;
app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId("com.greenwashlens.desktop");
}

app.whenReady().then(async () => {
  const userDataDir = app.getPath("userData");
  process.env.GREENWASH_USER_DATA_DIR = userDataDir;
  process.env.ALLOW_FILE_ORIGIN = "1";
  ensureDesktopEnvTemplate(userDataDir);
  loadEnvFile(userDataDir);

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

function ensureDesktopEnvTemplate(userDataDir) {
  const envPath = path.join(userDataDir, ".env");
  const templatePath = path.join(__dirname, "..", ".env.example");

  fs.mkdirSync(userDataDir, { recursive: true });

  if (!fs.existsSync(envPath) && fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, envPath);
  }

  console.log(`Greenwash Lens desktop env file: ${envPath}`);
}
