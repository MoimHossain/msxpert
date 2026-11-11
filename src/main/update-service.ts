import { gt, prerelease, valid } from "semver";
import type { AppUpdater, CancellationToken, UpdateInfo } from "electron-updater";
import type { UpdateRelease, UpdateState, UpdateVerification } from "../shared/updates";
import type { OperationGate } from "./operation-gate";
import { installerNames } from "../shared/branding";

export interface UpdateJournal {
  lastAttemptAt: string | null;
  lastCheckedAt: string | null;
  pending: { from: string; to: string } | null;
}

export type UpdateEngine = Pick<AppUpdater,
  "on" | "checkForUpdates" | "downloadUpdate" | "quitAndInstall">;

interface UpdateOptions {
  version: string;
  supported: boolean;
  verification?: UpdateVerification;
  engine: UpdateEngine | null;
  gate: OperationGate;
  journal: UpdateJournal;
  initialError?: string | null;
  saveJournal: (journal: UpdateJournal) => void;
  cancellationToken: () => CancellationToken;
  verifyInstaller: (path: string, info: UpdateInfo) => Promise<void>;
  prepareRestart: () => Promise<boolean>;
  publish: (state: UpdateState) => void;
}

export function isAlphaTestVersion(version: string): boolean {
  return Boolean(valid(version) && /^\d+\.\d+\.\d+-alpha\.\d+$/.test(version));
}

function allowedVersion(version: string, testing: boolean): boolean {
  return testing ? isAlphaTestVersion(version) : Boolean(valid(version) && prerelease(version) === null);
}

export function eligibleVersion(current: string, candidate: string, testing = false): boolean {
  return Boolean(valid(current) && allowedVersion(candidate, testing) && gt(candidate, current));
}

export function releaseDetails(current: string, info: UpdateInfo, testing = false): UpdateRelease {
  if (!eligibleVersion(current, info.version, testing)) throw new Error("ERR_UPDATE_VERSION");
  return validateRelease(info);
}

function validateRelease(info: UpdateInfo): UpdateRelease {
  if ("tag" in info && valid(String(info.tag)) !== valid(info.version)) throw new Error("ERR_UPDATE_VERSION");
  const names = installerNames(info.version);
  const file = info.files.find((item) => names.includes(item.url));
  if (!file || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) || info.files.length !== 1 ||
    !file.size || !Number.isFinite(file.size) || file.size < 0 ||
    ("packages" in info && info.packages)) {
    throw new Error("ERR_UPDATE_METADATA");
  }
  return {
    version: info.version,
    publishedAt: Number.isFinite(Date.parse(info.releaseDate)) ? info.releaseDate : null,
    notes: (typeof info.releaseNotes === "string"
      ? info.releaseNotes
      : info.releaseNotes?.map((note) => `${note.version}\n${note.note}`).join("\n\n") ?? ""
    ).slice(0, 30000),
    size: typeof file.size === "number" && file.size > 0 ? file.size : null,
  };
}

function retryTime(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("headers" in error) ||
    typeof error.headers !== "object" || error.headers === null) return null;
  const headers = error.headers;
  const after = "retry-after" in headers ? String(headers["retry-after"]) : "";
  const reset = "x-ratelimit-reset" in headers ? Number(headers["x-ratelimit-reset"]) * 1000 : NaN;
  const deadline = after ? /^\d+$/.test(after) ? Date.now() + Number(after) * 1000 : Date.parse(after) : reset;
  const date = new Date(deadline);
  return Number.isFinite(date.getTime()) && deadline > Date.now() ? date.toISOString() : null;
}

export function updateError(error: unknown): string {
  const code = error instanceof Error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (/ENOSPC/.test(code + message)) return "Not enough disk space to download and stage the update. Free some space and try again.";
  if (/SIGNATURE|CHECKSUM|SHA512|PUBLISHER|ERR_UPDATE_INTEGRITY/.test(code + message)) {
    return "Update verification failed. The installer was rejected. Retry or download an approved signed release.";
  }
  if (/NO_PUBLISHED|No published versions/.test(code + message)) return "No releases available.";
  if (/CHANNEL_FILE|ERR_UPDATE_METADATA|ERR_UPDATE_VERSION|INVALID_UPDATE_INFO/.test(code + message)) {
    return "The release has missing, invalid, or incompatible update metadata. The installed app was not changed.";
  }
  if (/403|429/.test(code + message)) return "GitHub refused the request or rate-limited this connection. Wait before retrying or open Releases.";
  if (/404|LATEST_VERSION_NOT_FOUND/.test(code + message)) return "The public release source is unavailable or has no supported release. Open Releases for details.";
  if (/401/.test(code + message)) return "Unexpected access failure for the public release source. No GitHub sign-in is required.";
  if (/ENOTFOUND|ECONN|ETIMEDOUT|TIMED_OUT|ERR_INTERNET|ERR_NETWORK/.test(code + message)) {
    return "Could not reach GitHub. Check your internet connection or proxy and try again.";
  }
  return "The update could not be completed. Retry or use the signed installer from Releases. Your local data was not removed.";
}

export class UpdateService {
  private state: UpdateState;
  private info: UpdateInfo | null = null;
  private installer: string | null = null;
  private token: CancellationToken | null = null;
  private cancelled = false;
  private busy = false;
  private disposed = false;
  private readonly journal: UpdateJournal;

  constructor(private readonly options: UpdateOptions) {
    this.journal = { ...options.journal };
    const pending = this.journal.pending;
    this.state = {
      verification: options.verification ?? "signed",
      phase: options.supported ? options.initialError ? "error" : "idle" : "unsupported",
      installedVersion: options.version,
      release: null,
      lastAttemptAt: this.journal.lastAttemptAt,
      lastCheckedAt: this.journal.lastCheckedAt,
      retryAt: null,
      progress: null,
      message: options.supported ? options.initialError ?? null : "In-app updates require an installed Windows x64 release with an approved publisher or an explicit alpha test build.",
      outcome: pending
        ? pending.to === options.version
          ? `Updated to ${options.version}.`
          : `The previous update to ${pending.to} was not confirmed. Installed version: ${options.version}. Retry or reinstall from Releases.`
        : null,
    };
    if (pending) {
      this.journal.pending = null;
      try {
        options.saveJournal(this.journal);
      } catch {
        this.state.phase = options.supported ? "error" : "unsupported";
        this.state.message = "Update history could not be saved. Check for updates to retry. Your portfolio data is unaffected.";
        this.state.outcome = null;
      }
    }
    options.engine?.on("error", (error) => {
      // Check/download failures also reject their promises. Install failures may only emit.
      if (this.state.phase === "installing") {
        this.options.gate.unlock();
        this.fail(error);
      }
    });
    options.engine?.on("download-progress", (progress) => {
      if (this.state.phase !== "downloading" || this.cancelled) return;
      this.set({
        progress: {
          percent: Math.min(100, Math.max(0, progress.percent)),
          transferred: progress.transferred,
          total: progress.total,
        },
      });
    });
  }

  getState(): UpdateState {
    return structuredClone(this.state);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelled = true;
    this.token?.cancel();
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.options.publish(this.getState());
  }

  private fail(error: unknown): void {
    this.info = null;
    this.installer = null;
    this.set({ phase: "error", message: updateError(error), retryAt: retryTime(error), progress: null, release: null });
  }

  private engine(): UpdateEngine {
    if (!this.options.supported || !this.options.engine) throw new Error("Updates require an installed Windows release.");
    return this.options.engine;
  }

  async check(): Promise<UpdateState> {
    const engine = this.engine();
    if (this.busy || this.state.phase === "installing") throw new Error("An update operation is already running.");
    if (this.state.retryAt && Date.parse(this.state.retryAt) > Date.now()) {
      throw new Error(`GitHub requested a pause. Try again after ${new Date(this.state.retryAt).toLocaleString()}.`);
    }
    this.busy = true;
    this.info = null;
    this.installer = null;
    this.journal.lastAttemptAt = new Date().toISOString();
    this.set({ phase: "checking", message: null, retryAt: null, release: null, progress: null, lastAttemptAt: this.journal.lastAttemptAt });
    try {
      this.options.saveJournal(this.journal);
      const result = await engine.checkForUpdates();
      if (!result) throw new Error("ERR_UPDATE_METADATA");
      if (result.isUpdateAvailable) {
        const release = releaseDetails(this.options.version, result.updateInfo, this.state.verification === "unsigned-test");
        this.info = result.updateInfo;
        this.set({ phase: "available", release });
      } else {
        if (!allowedVersion(result.updateInfo.version, this.state.verification === "unsigned-test") ||
          gt(result.updateInfo.version, this.options.version)) {
          throw new Error("ERR_UPDATE_VERSION");
        }
        validateRelease(result.updateInfo);
        this.set({ phase: "current", message: "You're up to date." });
      }
      this.journal.lastCheckedAt = new Date().toISOString();
      this.options.saveJournal(this.journal);
      this.set({ lastCheckedAt: this.journal.lastCheckedAt });
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
    }
    return this.getState();
  }

  async downloadAndRestart(version: string): Promise<void> {
    const engine = this.engine();
    if (this.busy || this.state.phase !== "available" || !this.info || this.info.version !== version) {
      throw new Error("Check for updates and select the available version first.");
    }
    this.busy = true;
    this.cancelled = false;
    this.token = this.options.cancellationToken();
    this.set({ phase: "downloading", progress: null, message: null });
    try {
      const paths = await engine.downloadUpdate(this.token);
      if (this.cancelled || this.disposed) return;
      if (paths.length !== 1 || !paths[0]) throw new Error("ERR_UPDATE_METADATA");
      this.installer = paths[0];
      this.set({ phase: "verifying", progress: null });
      // electron-updater 6 skips Authenticode on cache hits, so verify every path ourselves.
      await this.options.verifyInstaller(this.installer, this.info);
      if (this.cancelled || this.disposed) return;
      this.set({ phase: "ready" });
    } catch (error) {
      if (!this.cancelled) this.fail(error);
    } finally {
      this.token = null;
      this.busy = false;
      if (this.cancelled && !this.disposed) {
        this.set({ phase: "available", progress: null, message: "Download cancelled. No update was installed." });
      }
    }
    if (this.getState().phase === "ready" && !this.disposed) await this.restart(version);
  }

  cancelDownload(): void {
    if (this.state.phase !== "downloading") throw new Error("No cancellable download is running.");
    this.cancelled = true;
    this.token?.cancel();
    this.set({ message: "Cancelling download..." });
  }

  async restart(version: string): Promise<void> {
    const engine = this.engine();
    if (this.busy || this.state.phase !== "ready" || !this.installer || !this.info || this.info.version !== version) {
      throw new Error("A verified update for the selected version is not ready.");
    }
    if (!this.options.gate.tryLock()) {
      this.set({ message: "Update ready - finish running work, then select Restart to update." });
      return;
    }
    this.busy = true;
    try {
      this.set({ phase: "verifying", message: null });
      await this.options.verifyInstaller(this.installer, this.info);
      if (!await this.options.prepareRestart()) {
        this.set({ phase: "ready", message: "Update ready - save or close your edits, then select Restart to update." });
        return;
      }
      this.journal.pending = { from: this.options.version, to: version };
      this.options.saveJournal(this.journal);
      this.set({ phase: "installing", message: "Installing update and restarting..." });
      engine.quitAndInstall(true, true);
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      if (this.getState().phase !== "installing") this.options.gate.unlock();
    }
  }
}
