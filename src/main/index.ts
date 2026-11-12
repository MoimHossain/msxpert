import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { app, BrowserWindow, session, shell, type IpcMainInvokeEvent } from "electron";
import { AuthService } from "./auth";
import { registerIpc } from "./ipc";
import { MSX_ORIGIN, MsxClient } from "./msx-client";
import { PortfolioService } from "./portfolio-service";
import { VaultStore } from "./storage/vault";
import { OperationGate } from "./operation-gate";
import { createUpdateRuntime } from "./update-runtime";
import type { UpdateService } from "./update-service";
import { APP_NAME, LEGACY_APP_NAME } from "../shared/branding";
import { loadConnectionConfig } from "./connection-config";
import { AiService } from "./ai-service";
import { connectionRunners } from "./ai-runtime";
import { MilestoneExporter } from "./milestone-export";
import { OrgService } from "./org-service";
import { enrichOrgDataset } from "../domain/org-milestones";
import { z } from "zod";

// Keep the Chromium profile as well as the encrypted vault across the rename.
const userDataPath = join(app.getPath("appData"), LEGACY_APP_NAME);
mkdirSync(userDataPath, { recursive: true });
app.setPath("userData", userDataPath);
app.setName(APP_NAME);

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let mainWindow: BrowserWindow | null = null;
let store: VaultStore | null = null;
let updates: UpdateService | null = null;
let ai: AiService | null = null;
let stoppingOperations = false;
let milestoneExports: MilestoneExporter | null = null;
let organization: OrgService | null = null;

function isTrustedRequest(event: IpcMainInvokeEvent): boolean {
  return Boolean(mainWindow && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame);
}

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
    const dataPath = join(localAppData, LEGACY_APP_NAME);
    store = new VaultStore(dataPath);
    const auth = new AuthService(dataPath, loadConnectionConfig(dataPath));
    const msx = new MsxClient(auth);
    const portfolio = new PortfolioService(store, auth, msx, app.getVersion());
    const gate = new OperationGate();
    ai = new AiService(store, connectionRunners);
    const connections = ai;
    const org = new OrgService(store, {
      getIdentity: async () => {
        const identity = await auth.getAccountIdentity();
        if (!identity || !z.email().safeParse(identity.upn).success) return null;
        const profile = portfolio.profiles.getCached(identity.key);
        return { key: `${MSX_ORIGIN}:${identity.key}:${connections.getState().workiq.tenantId}`,
          upn: identity.upn, name: profile?.displayName ?? identity.name };
      },
      getConnection: () => connections.getState(),
      resolveActors: async signal => {
        const ids = portfolio.getMilestones().milestones.flatMap(row =>
          [row.createdById, row.ownerEntityType === "systemuser" ? row.ownerId : null])
          .filter((id): id is string => z.guid().safeParse(id).success);
        return msx.resolveOrgActors(ids, signal);
      },
    });
    organization = org;
    milestoneExports = new MilestoneExporter(async (ids, history) =>
      enrichOrgDataset(history ? portfolio.history.getMilestones(history, ids) : portfolio.getMilestones(ids), await org.getState()),
      () => app.getPath("downloads"), path => shell.showItemInFolder(path));
    registerIpc(portfolio, auth, msx, dataPath, gate, isTrustedRequest, ai, milestoneExports, org);
    updates = createUpdateRuntime(dataPath, gate, () => mainWindow, isTrustedRequest);
    await createWindow();
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    app.quit();
  });

  app.on("before-quit", (event) => {
    if (ai?.busy || milestoneExports?.busy || organization?.busy) {
      event.preventDefault();
      if (!stoppingOperations) {
        stoppingOperations = true;
        void Promise.all([organization?.cancel(), ai?.disconnect(), milestoneExports?.waitForIdle()]).then(() => app.quit()).catch(() => {
          console.error("OPERATION_SHUTDOWN_FAILED");
          stoppingOperations = false;
        });
      }
      return;
    }
    updates?.dispose();
    store?.close();
    store = null;
  });

  app.on("window-all-closed", () => app.quit());
}
