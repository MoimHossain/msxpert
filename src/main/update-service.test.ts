import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { CancellationToken, type UpdateCheckResult, type UpdateInfo } from "electron-updater";
import { OperationGate } from "./operation-gate";
import { eligibleVersion, releaseDetails, UpdateService, type UpdateJournal } from "./update-service";

const info: UpdateInfo = {
  version: "0.4.0",
  releaseDate: "2026-11-11T08:00:00.000Z",
  path: "CSU-Console-Setup-0.4.0.exe",
  sha512: Buffer.alloc(64).toString("base64"),
  files: [{
    url: "CSU-Console-Setup-0.4.0.exe",
    sha512: Buffer.alloc(64).toString("base64"),
    size: 1024,
  }],
  releaseNotes: "<script>not executable</script>",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Engine extends EventEmitter {
  checkForUpdates = vi.fn(async (): Promise<UpdateCheckResult> => ({
    isUpdateAvailable: true, updateInfo: structuredClone(info), versionInfo: structuredClone(info),
  }));
  downloadUpdate = vi.fn(async (_token?: CancellationToken) => ["C:\\cache\\CSU-Console-Setup-0.4.0.exe"]);
  quitAndInstall = vi.fn();
}

function setup(overrides: { supported?: boolean; journal?: UpdateJournal; version?: string; journalSaveError?: boolean; verification?: "signed" | "unsigned-test" } = {}) {
  const engine = new Engine();
  const gate = new OperationGate();
  const verify = vi.fn(async () => {});
  const prepare = vi.fn(async () => true);
  const save = vi.fn(() => {
    if (overrides.journalSaveError) throw new Error("Cannot write update journal");
  });
  const publish = vi.fn();
  const service = new UpdateService({
    version: overrides.version ?? "0.3.0",
    supported: overrides.supported ?? true,
    verification: overrides.verification,
    engine, gate,
    journal: overrides.journal ?? { lastAttemptAt: null, lastCheckedAt: null, pending: null },
    saveJournal: save,
    cancellationToken: () => new CancellationToken(),
    verifyInstaller: verify, prepareRestart: prepare, publish,
  });
  return { engine, gate, verify, prepare, save, publish, service };
}

describe("release eligibility and metadata", () => {
  it("uses semantic ordering and rejects prerelease, same, older, and malformed versions", () => {
    expect(eligibleVersion("0.3.0", "0.10.0")).toBe(true);
    for (const candidate of ["0.3.0", "0.2.9", "0.4.0-beta.1", "oops"]) {
      expect(eligibleVersion("0.3.0", candidate)).toBe(false);
    }
  });

  it("requires the exact full installer and a SHA-512 checksum", () => {
    expect(releaseDetails("0.3.0", info).version).toBe("0.4.0");
    for (const files of [
      [],
      [{ ...info.files[0], url: "https://evil.example/installer.exe" }],
      [{ ...info.files[0], sha512: "invalid" }],
      [...info.files, ...info.files],
    ]) {
      expect(() => releaseDetails("0.3.0", { ...info, files })).toThrow("ERR_UPDATE_METADATA");
    }
  });

  it("rejects a release tag that disagrees with the manifest", () => {
    const tagged = { ...info, tag: "v0.5.0" };
    expect(() => releaseDetails("0.3.0", tagged)).toThrow("ERR_UPDATE_VERSION");
  });

  it("accepts MCAPS installers and legacy aliases, but not a mismatched renamed installer", () => {
    const renamed = {
      ...info, path: "MCAPS-Console-Setup-0.4.0.exe",
      files: [{ ...info.files[0], url: "MCAPS-Console-Setup-0.4.0.exe" }],
    };
    expect(releaseDetails("0.3.0", renamed).version).toBe("0.4.0");
    expect(releaseDetails("0.3.0", info).version).toBe("0.4.0");
    expect(() => releaseDetails("0.3.0", {
      ...renamed, files: [{ ...renamed.files[0], url: "MCAPS-Console-Setup-0.5.0.exe" }],
    })).toThrow("ERR_UPDATE_METADATA");
  });

  it("isolates explicitly enabled alpha updates from production releases", () => {
    expect(eligibleVersion("0.4.0-alpha.1", "0.4.0-alpha.2")).toBe(false);
    expect(eligibleVersion("0.4.0-alpha.1", "0.4.0-alpha.2", true)).toBe(true);
    for (const candidate of ["0.4.0", "0.4.0-beta.1", "0.4.0-alpha.1", "0.4.0-alpha.preview"]) {
      expect(eligibleVersion("0.4.0-alpha.1", candidate, true)).toBe(false);
    }
  });
});

describe("UpdateService", () => {
  it("allows explicit unsigned alpha builds to update without weakening the signed default", async () => {
    const alpha: UpdateInfo = {
      ...info,
      version: "0.4.0-alpha.2",
      path: "CSU-Console-Setup-0.4.0-alpha.2.exe",
      files: [{ ...info.files[0], url: "CSU-Console-Setup-0.4.0-alpha.2.exe" }],
    };
    const test = setup({ version: "0.4.0-alpha.1", verification: "unsigned-test" });
    test.engine.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: true, updateInfo: alpha, versionInfo: alpha });
    test.engine.downloadUpdate.mockResolvedValueOnce(["C:\\cache\\CSU-Console-Setup-0.4.0-alpha.2.exe"]);
    expect((await test.service.check()).phase).toBe("available");
    await test.service.downloadAndRestart(alpha.version);
    expect(test.service.getState().verification).toBe("unsigned-test");
    expect(test.engine.quitAndInstall).toHaveBeenCalledOnce();
    const production = setup();
    production.engine.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: true, updateInfo: alpha, versionInfo: alpha });
    expect((await production.service.check()).phase).toBe("error");
    expect(production.engine.downloadUpdate).not.toHaveBeenCalled();
  });

  it("checks explicitly, publishes progress, re-verifies before handoff, and records the intended version", async () => {
    const { service, engine, verify, save, gate } = setup();
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
    expect((await service.check()).phase).toBe("available");
    expect(engine.downloadUpdate).not.toHaveBeenCalled();
    const download = deferred<string[]>();
    engine.downloadUpdate.mockImplementationOnce(() => download.promise);
    const running = service.downloadAndRestart("0.4.0");
    engine.emit("download-progress", { percent: 35, transferred: 350, total: 1000 });
    expect(service.getState().progress?.percent).toBe(35);
    download.resolve(["C:\\cache\\CSU-Console-Setup-0.4.0.exe"]);
    await running;
    expect(verify).toHaveBeenCalledTimes(2);
    expect(engine.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ pending: { from: "0.3.0", to: "0.4.0" } }));
    await expect(gate.run(() => "write")).rejects.toThrow("preparing to restart");
  });

  it("defers while main-process work is active and blocks new work during renderer confirmation", async () => {
    const { service, gate, engine, prepare } = setup();
    const work = deferred<void>();
    const runningWork = gate.run(() => work.promise);
    await service.check();
    await service.downloadAndRestart("0.4.0");
    expect(service.getState().phase).toBe("ready");
    expect(prepare).not.toHaveBeenCalled();
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
    work.resolve();
    await runningWork;
    prepare.mockImplementationOnce(async () => {
      await expect(gate.run(() => "write")).rejects.toThrow();
      return true;
    });
    await service.restart("0.4.0");
    expect(engine.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("defers for dirty forms and requires explicit restart after edits are saved", async () => {
    const { service, prepare, engine, gate } = setup();
    prepare.mockResolvedValueOnce(false);
    await service.check();
    await service.downloadAndRestart("0.4.0");
    expect(service.getState().phase).toBe("ready");
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
    await expect(gate.run(() => "saved")).resolves.toBe("saved");
    await service.restart("0.4.0");
    expect(engine.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("rejects a changed target and duplicate operations", async () => {
    const { service, engine } = setup();
    const checking = deferred<UpdateCheckResult>();
    engine.checkForUpdates.mockImplementationOnce(() => checking.promise);
    const running = service.check();
    await expect(service.check()).rejects.toThrow("already running");
    checking.resolve({ isUpdateAvailable: true, updateInfo: info, versionInfo: info });
    await running;
    await expect(service.downloadAndRestart("9.0.0")).rejects.toThrow("select");
    expect(engine.downloadUpdate).not.toHaveBeenCalled();
  });

  it("cancels without installing and ignores progress after cancellation", async () => {
    const { service, engine, verify } = setup();
    await service.check();
    const download = deferred<string[]>();
    engine.downloadUpdate.mockImplementationOnce((token) => {
      token?.onCancel(() => download.reject(new Error("cancelled")));
      return download.promise;
    });

    const running = service.downloadAndRestart("0.4.0");
    service.cancelDownload();
    engine.emit("download-progress", { percent: 99, transferred: 999, total: 1000 });
    await running;
    expect(service.getState().phase).toBe("available");
    expect(service.getState().progress).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
  });

  it("ignores a download completing after cancellation or shutdown", async () => {
    for (const shutdown of [false, true]) {
      const { service, engine, verify } = setup();
      await service.check();
      const download = deferred<string[]>();
      engine.downloadUpdate.mockImplementationOnce(() => download.promise);
      const running = service.downloadAndRestart("0.4.0");
      if (shutdown) service.dispose();
      else service.cancelDownload();
      download.resolve(["C:\\cache\\CSU-Console-Setup-0.4.0.exe"]);
      await running;
      expect(verify).not.toHaveBeenCalled();
      expect(engine.quitAndInstall).not.toHaveBeenCalled();
    }
  });

  it("rejects cached or fresh installers when verification fails", async () => {
    const { service, verify, engine } = setup();
    verify.mockRejectedValueOnce(new Error("ERR_UPDATE_INTEGRITY_SIGNATURE"));
    await service.check();
    await service.downloadAndRestart("0.4.0");
    expect(service.getState().phase).toBe("error");
    expect(service.getState().message).toContain("rejected");
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
  });

  it("rechecks a ready installer at restart and unlocks after rejection", async () => {
    const { service, verify, engine, prepare, gate } = setup();
    prepare.mockResolvedValueOnce(false);
    await service.check();
    await service.downloadAndRestart("0.4.0");
    verify.mockRejectedValueOnce(new Error("ERR_UPDATE_INTEGRITY_CHECKSUM"));
    await service.restart("0.4.0");
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
    await expect(gate.run(() => "safe")).resolves.toBe("safe");
  });

  it("does not turn failed checks into up-to-date or expose raw URLs", async () => {
    const { service, engine } = setup();
    engine.checkForUpdates.mockRejectedValueOnce(new Error("ECONNRESET https://secret.example/?token=do-not-log"));
    await service.check();
    expect(service.getState().phase).toBe("error");
    expect(service.getState().lastAttemptAt).not.toBeNull();
    expect(service.getState().lastCheckedAt).toBeNull();
    expect(JSON.stringify(service.getState())).not.toContain("do-not-log");
  });

  it("honors Retry-After before sending another check", async () => {
    vi.useFakeTimers();
    try {
      const { service, engine } = setup();
      engine.checkForUpdates.mockRejectedValueOnce(Object.assign(new Error("HTTP 429"), { headers: { "retry-after": "60" } }));
      await service.check();
      expect(service.getState().retryAt).not.toBeNull();
      await expect(service.check()).rejects.toThrow("requested a pause");
      expect(engine.checkForUpdates).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60000);
      expect((await service.check()).phase).toBe("available");
    } finally {
      vi.useRealTimers();
    }
  });

  it("distinguishes no releases and incompatible newer versions from up-to-date", async () => {
    const { service, engine } = setup();
    engine.checkForUpdates.mockRejectedValueOnce(new Error("No published versions on GitHub"));
    await service.check();
    expect(service.getState().message).toBe("No releases available.");
    engine.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: false, updateInfo: info, versionInfo: info });
    await service.check();
    expect(service.getState().phase).toBe("error");
  });

  it("leaves a current installation alone", async () => {
    const { service, engine } = setup({ version: "0.4.0" });
    engine.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: false, updateInfo: info, versionInfo: info });
    expect((await service.check()).phase).toBe("current");
    expect(engine.downloadUpdate).not.toHaveBeenCalled();
  });

  it("does not update unpackaged builds", async () => {
    const { service, engine } = setup({ supported: false });
    expect(service.getState().phase).toBe("unsupported");
    await expect(service.check()).rejects.toThrow("installed Windows");
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
  });

  it("confirms a pending target only when the running version matches", () => {
    const journal = { lastAttemptAt: null, lastCheckedAt: null, pending: { from: "0.3.0", to: "0.4.0" } };
    expect(setup({ journal, version: "0.4.0" }).service.getState().outcome).toBe("Updated to 0.4.0.");
    expect(setup({ journal }).service.getState().outcome).toContain("not confirmed");
  });

  it("surfaces journal write failures instead of starting the installer", async () => {
    const { service, save, engine, gate } = setup();
    await service.check();
    save.mockImplementationOnce(() => { throw new Error("disk failure"); });
    await service.downloadAndRestart("0.4.0");
    expect(service.getState().phase).toBe("error");
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
    await expect(gate.run(() => true)).resolves.toBe(true);
  });

  it("surfaces installer error events and releases the operation lock", async () => {
    const { service, engine, gate } = setup();
    engine.quitAndInstall.mockImplementationOnce(() => {
      engine.emit("error", new Error("Cannot spawn installer"));
    });
    await service.check();
    await service.downloadAndRestart("0.4.0");
    expect(service.getState().phase).toBe("error");
    await expect(gate.run(() => true)).resolves.toBe(true);
  });

  it("keeps the app usable if recording the previous update result fails", () => {
    const { service } = setup({
      version: "0.4.0",
      journal: { lastAttemptAt: null, lastCheckedAt: null, pending: { from: "0.3.0", to: "0.4.0" } },
      journalSaveError: true,
    });
    expect(service.getState().phase).toBe("error");
    expect(service.getState().outcome).toBeNull();
    expect(service.getState().message).toContain("history could not be saved");
  });
});
