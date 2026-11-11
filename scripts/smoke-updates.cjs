const assert = require("node:assert/strict");
const { join } = require("node:path");

if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const { mkdtempSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const directory = mkdtempSync(join(tmpdir(), "csu-update-smoke-"));
  const env = { ...process.env, CSU_SMOKE_DATA: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const result = spawnSync(require("electron"), [__filename], {
      env, stdio: "inherit", timeout: 60000, windowsHide: true,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
} else {
  const { app, BrowserWindow, ipcMain } = require("electron");
  app.setPath("userData", process.env.CSU_SMOKE_DATA);
  const root = join(__dirname, "..");
  const { defaultSettings } = require(join(root, "dist-main", "domain", "defaults.js"));
  const { IPC } = require(join(root, "dist-main", "shared", "ipc.js"));
  let window;
  let signedIn = false;
  let configured = false;
  let phase = "idle";
  let confirmations = [];
  let openCount = 0;
  let downloads = 0;
  const release = {
    version: "0.4.0", publishedAt: "2026-11-11T08:00:00.000Z",
    notes: "<img src=x onerror=alert('unsafe')> Release notes stay text.", size: 100000000,
  };
  const snapshot = () => ({
    verification: "unsigned-test",
    phase, installedVersion: "0.3.0", release: phase === "idle" ? null : release,
    lastAttemptAt: null, lastCheckedAt: null,
    progress: phase === "downloading" ? { percent: 40, transferred: 40000000, total: 100000000 } : null,
    message: null, outcome: "Updated to 0.3.0.",
  });
  const publish = (next) => {
    phase = next;
    window.webContents.send(IPC.updateChanged, snapshot());
  };
  const js = (source) => window.webContents.executeJavaScript(source);
  const wait = async (predicate) => {
    const deadline = Date.now() + 10000;
    while (!await predicate()) {
      if (Date.now() > deadline) throw Error("Timed out waiting for renderer state");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };
  const click = async (label) => {
    const clicked = await js(`(() => {
      const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(label)});
      if (!button || button.disabled) return false;
      button.click(); return true;
    })()`);
    assert.ok(clicked, `Enabled button: ${label}`);
  };
  app.whenReady().then(async () => {
    ipcMain.handle(IPC.bootstrap, () => {
      const settings = defaultSettings();
      settings.privacyAccepted = true;
      return {
        auth: { signedIn, name: null, username: null, userId: null },
        settings,
        overview: {
          accounts: configured ? [{
            id: "smoke-account", tpid: "000", name: "Test account", msxAccountId: "smoke-account", country: null,
            createdAt: "2026-11-11T08:00:00.000Z", hasData: false, milestones: 0, accountRecords: 0,
            onTrack: 0, atRisk: 0, blocked: 0, committed: 0, uncommitted: 0, monthlyUse: 0, owners: 0,
            pendingChanges: 0, lastRun: null,
          }] : [],
          totals: { milestones: 0, atRisk: 0, blocked: 0, monthlyUse: 0, pendingChanges: 0 },
          scope: settings.scope,
        },
        team: [], pods: [], dataPath: process.env.CSU_SMOKE_DATA, version: "0.3.0",
      };
    });
    ipcMain.handle(IPC.updateState, snapshot);
    ipcMain.handle(IPC.updateCheck, () => { publish("available"); return snapshot(); });
    ipcMain.handle(IPC.updateDownload, (_event, version) => {
      assert.equal(version, release.version);
      downloads++;
      publish("downloading");
    });
    ipcMain.handle(IPC.updateCancel, () => publish("available"));
    ipcMain.handle(IPC.updateOpenReleases, () => { openCount++; });
    ipcMain.handle(IPC.updateConfirmRestart, (_event, response) => {
      confirmations.push(response);
      publish("ready");
    });
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(root, "dist-main", "preload", "index.js"),
        sandbox: true, contextIsolation: true, nodeIntegration: false,
      },
    });
    await window.loadFile(join(root, "dist-renderer", "index.html"));
    await wait(() => js("Boolean(document.querySelector('.startup-updates summary'))"));
    await wait(() => js("document.body.innerText.includes('Updated to 0.3.0.')"));
    await js("document.querySelector('.startup-updates summary').click()");
    await click("Check for updates");
    await wait(() => js("document.body.innerText.includes('Version 0.4.0 is available')"));
    assert.equal(await js("document.body.innerText.includes('do not verify a trusted publisher')"), true);
    assert.equal(await js("document.querySelector('.update-release-notes img') === null"), true);
    assert.equal(await js("document.querySelector('.update-release-notes').textContent.includes('<img')"), true);
    await click("Update and restart");
    await wait(() => js("document.body.innerText.includes('40%')"));
    await click("Cancel download");
    await wait(() => js("document.body.innerText.includes('Version 0.4.0 is available')"));
    await click("Open releases");
    await wait(() => openCount === 1);
    window.webContents.send(IPC.updatePrepareRestart, { id: "00000000-0000-4000-8000-000000000001" });
    await wait(() => confirmations.length === 1);
    assert.equal(confirmations[0].safe, true, "Clean signed-out screen permits restart");
    await wait(() => js("document.querySelector('.update-restart-overlay') === null"));
    signedIn = true;
    phase = "idle";
    await window.loadFile(join(root, "dist-renderer", "index.html"));
    await wait(() => js("Boolean(document.querySelector('.scope-editor input'))"));
    await js(`(() => {
      const input = document.querySelector('.scope-editor input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved scope');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await wait(() => js("document.querySelector('.scope-editor input').value === 'Unsaved scope'"));
    window.webContents.send(IPC.updatePrepareRestart, { id: "00000000-0000-4000-8000-000000000002" });
    await wait(() => confirmations.length === 2);
    assert.equal(confirmations[1].safe, false, "Unsaved setup form blocks update restart");
    configured = true;
    phase = "idle";
    await window.loadFile(join(root, "dist-renderer", "index.html"));
    await wait(() => js("Boolean(document.querySelector('.sidebar'))"));
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.updates-panel'))"));
    assert.equal(await js("document.querySelector('.startup-updates') === null"), true);
    await click("Check for updates");
    await wait(() => js("document.body.innerText.includes('Version 0.4.0 is available')"));
    assert.equal(downloads, 1);
    console.log("Update UI smoke passed: Settings, signed-out access/result notice, check, escaped notes, progress, cancellation, release action, and dirty-form restart guard.");
    window.destroy();
    app.exit(0);
  }).catch((error) => {
    console.error(error);
    if (window && !window.isDestroyed()) window.destroy();
    app.exit(1);
  });
}
