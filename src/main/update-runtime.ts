import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { app, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { CancellationToken, NsisUpdater } from "electron-updater";
import { z } from "zod";
import { IPC } from "../shared/ipc";
import { RELEASES_URL } from "../shared/updates";
import { OperationGate } from "./operation-gate";
import { isAlphaTestVersion, UpdateService, type UpdateJournal } from "./update-service";
import { verifyAuthenticode, verifyChecksum, verifyTestInstallerVersion } from "./update-verification";

const journalSchema = z.object({
  lastAttemptAt: z.iso.datetime().nullable(),
  lastCheckedAt: z.iso.datetime().nullable(),
  pending: z.object({ from: z.string().max(100), to: z.string().max(100) }).nullable(),
});

export function createUpdateRuntime(
  dataPath: string,
  gate: OperationGate,
  getWindow: () => BrowserWindow | null,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
): UpdateService {
  const journalPath = join(dataPath, "updates.json");
  let journal: UpdateJournal = { lastAttemptAt: null, lastCheckedAt: null, pending: null };
  let initialError: string | null = null;
  try {
    journal = journalSchema.parse(JSON.parse(readFileSync(journalPath, "utf8")));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      console.error("UPDATE_JOURNAL_READ_FAILED");
      initialError = "Update history could not be read. Check for updates to retry. Your portfolio data is unaffected.";
    }
  }
  const packageInfo: unknown = JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8"));
  const trust = z.object({ updatePublisher: z.string().startsWith("CN=").min(4) }).safeParse(packageInfo);
  const publisher = trust.success ? trust.data.updatePublisher : null;
  const testMarker = z.object({ updateMode: z.literal("unsigned-test") }).safeParse(packageInfo);
  const testing = !publisher && testMarker.success && isAlphaTestVersion(app.getVersion());
  const installed = existsSync(join(dirname(process.execPath), "Uninstall CSU Console.exe"));
  const supported = app.isPackaged && installed && process.platform === "win32" &&
    process.arch === "x64" && (publisher !== null || testing);
  const updater = supported ? new NsisUpdater({
    provider: "github",
    owner: "MoimHossain",
    repo: "msxpert",
    private: false,
  }) : null;
  if (updater) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.allowPrerelease = testing;
    if (testing) updater.channel = "alpha";
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.disableDifferentialDownload = true;
    updater.requestHeaders = null;
    updater.logger = null;
    if (publisher) {
      updater.verifyUpdateCodeSignature = async (_names, path) => {
        try {
          await verifyAuthenticode(path, publisher);
          return null;
        } catch {
          return "The installer signature could not be verified against the approved publisher.";
        }
      };
    }
  }
  let pendingRestart: { id: string; resolve: (safe: boolean) => void } | null = null;
  const service = new UpdateService({
    version: app.getVersion(),
    supported,
    verification: testing ? "unsigned-test" : "signed",
    engine: updater,
    gate,
    journal,
    initialError,
    saveJournal: (next) => {
      const temporary = `${journalPath}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(next)}\n`, "utf8");
      renameSync(temporary, journalPath);
    },
    cancellationToken: () => new CancellationToken(),
    verifyInstaller: async (path, info) => {
      const expected = `CSU-Console-Setup-${info.version}.exe`;
      if ((!publisher && !testing) || basename(path) !== expected) throw new Error("ERR_UPDATE_INTEGRITY_FILENAME");
      const file = info.files.find((item) => item.url === expected);
      if (!file) throw new Error("ERR_UPDATE_METADATA");
      try {
        await verifyChecksum(path, file.sha512);
        if (publisher) await verifyAuthenticode(path, publisher, info.version);
        else await verifyTestInstallerVersion(path, info.version);
      } catch (error) {
        // Only delete the exact installer path returned by this updater's download.
        rmSync(path, { force: true });
        throw error;
      }
    },
    prepareRestart: () => new Promise<boolean>((resolve) => {
      const window = getWindow();
      if (!window || window.isDestroyed()) {
        resolve(false);
        return;
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        pendingRestart = null;
        resolve(false);
      }, 5000);
      pendingRestart = {
        id,
        resolve: (safe) => {
          clearTimeout(timer);
          pendingRestart = null;
          resolve(safe);
        },
      };
      window.webContents.send(IPC.updatePrepareRestart, { id });
    }),
    publish: (state) => {
      const window = getWindow();
      if (window && !window.isDestroyed()) window.webContents.send(IPC.updateChanged, state);
    },
  });
  const handle = (channel: string, action: (input: unknown) => unknown) => {
    ipcMain.handle(channel, (event, input: unknown) => {
      if (!isTrusted(event)) throw new Error("Untrusted update request.");
      return action(input);
    });
  };
  const versionSchema = z.string().min(1).max(100);
  handle(IPC.updateState, () => service.getState());
  handle(IPC.updateCheck, () => service.check());
  handle(IPC.updateDownload, (version) => service.downloadAndRestart(versionSchema.parse(version)));
  handle(IPC.updateCancel, () => service.cancelDownload());
  handle(IPC.updateInstall, (version) => service.restart(versionSchema.parse(version)));
  handle(IPC.updateOpenReleases, () => shell.openExternal(RELEASES_URL));
  handle(IPC.updateConfirmRestart, (input) => {
    const response = z.object({ id: z.uuid(), safe: z.boolean() }).parse(input);
    if (!pendingRestart || pendingRestart.id !== response.id) throw new Error("The restart request has expired.");
    pendingRestart.resolve(response.safe);
  });
  return service;
}
