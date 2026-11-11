import { join } from "node:path";
import { app, BrowserWindow, session, shell } from "electron";
import { AuthService } from "./auth";
import { registerIpc } from "./ipc";
import { MSX_ORIGIN, MsxClient } from "./msx-client";
import { PortfolioService } from "./portfolio-service";
import { VaultStore } from "./storage/vault";

app.setName("CSU Console");

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let mainWindow: BrowserWindow | null = null;
let store: VaultStore | null = null;

function isAllowedExternal(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.origin === MSX_ORIGIN;
  } catch {
    return false;
  }
}

async function createWindow(): Promise<void> {
  const preload = join(__dirname, "..", "preload", "index.js");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (url === current) return;
    event.preventDefault();
    if (isAllowedExternal(url)) void shell.openExternal(url);
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    await mainWindow.loadURL(developmentUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, "..", "..", "dist-renderer", "index.html"));
  }
}

if (singleInstance) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    const localAppData =
      process.env.LOCALAPPDATA ?? app.getPath("userData");
    const dataPath = join(localAppData, "CSU Console");
    store = new VaultStore(dataPath);
    const auth = new AuthService(dataPath);
    const msx = new MsxClient(auth);
    const portfolio = new PortfolioService(store, auth, msx, app.getVersion());
    registerIpc(portfolio, auth, msx, dataPath);
    await createWindow();
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    app.quit();
  });

  app.on("before-quit", () => {
    store?.close();
    store = null;
  });

  app.on("window-all-closed", () => app.quit());
}
