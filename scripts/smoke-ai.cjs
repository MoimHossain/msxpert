// Opt-in: makes real, billable synthetic requests with the user's existing clients.
const assert = require("node:assert/strict");
const { join, resolve } = require("node:path");

if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const { mkdtempSync, rmSync } = require("node:fs");
  const directory = mkdtempSync(join(require("node:os").tmpdir(), "mcaps-ai-ui-"));
  const env = { ...process.env, MCAPS_AI_SMOKE_DATA: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const result = spawnSync(require("electron"), [__filename], {
      env, stdio: "inherit", timeout: 300_000, windowsHide: true,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
} else {
  const { app, BrowserWindow, ipcMain } = require("electron");
  app.setPath("userData", join(process.env.MCAPS_AI_SMOKE_DATA, "chromium"));
  const root = process.env.MCAPS_AI_SMOKE_APP ? resolve(process.env.MCAPS_AI_SMOKE_APP) : join(__dirname, "..");
  let window;
  let store;
  let ai;
  const js = (source) => window.webContents.executeJavaScript(source);
  const wait = async (predicate) => {
    const deadline = Date.now() + 135_000;
    while (!await predicate()) {
      if (Date.now() > deadline) throw Error("Timed out waiting for live connection UI");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const click = async (label) => {
    assert.ok(await js(`(() => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)});
      if (!button || button.disabled) return false;
      button.click(); return true;
    })()`), `Enabled button: ${label}`);
  };
  app.whenReady().then(async () => {
    const { defaultSettings } = require(join(root, "dist-main", "domain", "defaults.js"));
    const { IPC } = require(join(root, "dist-main", "shared", "ipc.js"));
    const { VaultStore } = require(join(root, "dist-main", "main", "storage", "vault.js"));
    const { AiService } = require(join(root, "dist-main", "main", "ai-service.js"));
    const { connectionRunners } = require(join(root, "dist-main", "main", "ai-runtime.js"));
    const { OperationGate } = require(join(root, "dist-main", "main", "operation-gate.js"));
    const { registerIpc } = require(join(root, "dist-main", "main", "ipc.js"));
    const dataPath = join(process.env.MCAPS_AI_SMOKE_DATA, "vault");
    store = new VaultStore(dataPath);
    ai = new AiService(store, connectionRunners);
    const settings = { ...defaultSettings(), privacyAccepted: true, onboardingComplete: true };
    const overview = {
      accounts: [], totals: { milestones: 0, atRisk: 0, blocked: 0, monthlyUse: 0, pendingChanges: 0 }, scope: settings.scope,
    };
    const profile = {
      id: "synthetic", displayName: "Connection Test", jobTitle: null, email: null,
      department: null, officeLocation: null, photoDataUrl: null, updatedAt: new Date().toISOString(),
    };
    // Only the MSX/update data is synthetic. The production AI IPC, vault,
    // provider runners, preload and renderer are exercised unchanged.
    registerIpc({
      bootstrap: () => ({
        auth: { signedIn: true, name: "Connection Test", username: null, userId: null },
        profile, settings, overview, team: [], pods: [], dataPath, version: "live-test",
      }),
      profiles: { refresh: async () => profile },
      getOverview: () => overview,
      refreshAccountTerritories: async () => {},
    }, {}, {}, dataPath, new OperationGate(),
    (event) => event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame, ai);
    ipcMain.handle(IPC.updateState, () => ({
      verification: "unsigned-test", phase: "unsupported", installedVersion: "live-test",
      release: null, lastAttemptAt: null, lastCheckedAt: null, progress: null, message: null, outcome: null,
    }));
    window = new BrowserWindow({
      show: false, width: 1280, height: 900,
      webPreferences: {
        preload: join(root, "dist-main", "preload", "index.js"),
        sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      },
    });
    await window.loadFile(join(root, "dist-renderer", "index.html"));
    await wait(() => js("Boolean(document.querySelector('.sidebar-settings'))"));
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.ai-connections fieldset'))"));
    assert.equal(await js("document.querySelector('.workiq-connections fieldset').disabled"), true);
    await click("Test AI access");
    await wait(() => js("Boolean(document.querySelector('.ai-connections .connection-outcome'))"));
    assert.equal(await js("Boolean(document.querySelector('.ai-connections .connection-success'))"), true,
      await js("document.querySelector('.ai-connections .connection-outcome').innerText"));
    assert.equal(await js("document.querySelector('.connection-response').textContent.startsWith('MCAPS_AI_OK_')"), true);
    assert.equal(await js("document.querySelector('.workiq-connections fieldset').disabled"), false);
    console.log("Actual LLM request passed through the Settings UI and production IPC.");
    await click("Test Work IQ access");
    await wait(() => js("Boolean(document.querySelector('.workiq-connections .connection-outcome'))"));
    assert.equal(await js("Boolean(document.querySelector('.workiq-connections .connection-success'))"), true,
      await js("document.querySelector('.workiq-connections .connection-outcome').innerText"));
    assert.equal(await js("document.querySelector('.workiq-connections .connection-response').textContent.startsWith('MCAPS_WORKIQ_OK_')"), true);
    console.log("Actual Work IQ service request passed through the gated Settings UI. No workplace content was requested.");
    await ai.disconnect();
    window.destroy();
    store.close();
    store = null;
    app.exit(0);
  }).catch(async (error) => {
    console.error(error instanceof Error ? error.message : "Live connection smoke failed.");
    await ai?.disconnect();
    if (window && !window.isDestroyed()) window.destroy();
    store?.close();
    app.exit(1);
  });
}
