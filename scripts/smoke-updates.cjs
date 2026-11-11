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
  if (process.env.MCAPS_SMOKE_SCREENSHOT) app.disableHardwareAcceleration();
  app.setPath("userData", process.env.CSU_SMOKE_DATA);
  const root = join(__dirname, "..");
  const { defaultSettings } = require(join(root, "dist-main", "domain", "defaults.js"));
  const { IPC } = require(join(root, "dist-main", "shared", "ipc.js"));
  let window;
  let signedIn = false;
  let configured = false;
  let privacyAccepted = true;
  let resetCalls = 0;
  let phase = "idle";
  let confirmations = [];
  let openCount = 0;
  let downloads = 0;
  let imports = 0;
  let profileRefreshes = 0;
  const demoTerritory = {
    id: "00000000-0000-0000-0000-000000000001", name: "Demo territory",
    accountTeamUnitGroup: "Demo group", salesUnit: "Demo unit", salesGroup: "Demo sales group", fiscalYear: null,
  };
  const demoAccounts = [
    { id: "smoke-account", name: "Test account", monthlyUse: 9876543, owners: 31, milestones: 142,
      onTrack: 106, atRisk: 13, blocked: 23, committed: 60, uncommitted: 82, pendingChanges: 2,
      lastRun: { ok: true, at: new Date().toISOString(), baseline: true } },
    { id: "demo-account-2", name: "Demo Financial Services", monthlyUse: 1234567, owners: 17, milestones: 84,
      onTrack: 69, atRisk: 11, blocked: 4, committed: 34, uncommitted: 50, pendingChanges: 0, lastRun: null },
    { id: "demo-account-3", name: "Example Holdings", monthlyUse: 9876543210, owners: 206, milestones: 500,
      onTrack: 420, atRisk: 30, blocked: 50, committed: 180, uncommitted: 320, pendingChanges: 3,
      lastRun: { ok: false, at: new Date().toISOString(), baseline: false } },
  ].map((account, index) => ({
    tpid: index === 0 ? "000" : String(100 + index), msxAccountId: account.id, country: null,
    createdAt: "2026-11-11T08:00:00.000Z", hasData: true, accountRecords: 20,
    ...account,
  }));
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
  const screenshot = async (path) => {
    await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const image = await new Promise((resolve) => {
      const paint = (_event, _dirty, frame) => {
        if (frame.isEmpty()) return;
        window.webContents.removeListener("paint", paint);
        clearInterval(invalidate);
        resolve(frame);
      };
      window.webContents.on("paint", paint);
      const invalidate = setInterval(() => window.webContents.invalidate(), 50);
    });
    require("node:fs").writeFileSync(path, image.toPNG());
  };
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
  const hoverThemeToggle = async () => {
    const readLayout = `(() => {
      const button = document.querySelector('.theme-toggle').getBoundingClientRect();
      return {
        theme: document.documentElement.dataset.theme,
        savedTheme: localStorage.getItem('csu-console-theme'),
        height: document.scrollingElement.scrollHeight,
        width: document.scrollingElement.scrollWidth,
        rootHeight: document.querySelector('#root').getBoundingClientRect().height,
        background: getComputedStyle(document.querySelector('.fluent-app-theme')).backgroundColor,
        pointerReachesButton: Boolean(document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.closest('.theme-toggle')),
        button: { x: button.x, y: button.y, width: button.width, height: button.height },
      };
    })()`;
    const before = await js(readLayout);
    await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved", x: before.button.x + before.button.width / 2, y: before.button.y + before.button.height / 2,
    });
    await wait(() => js("document.querySelector('.theme-toggle').matches(':hover') && Boolean(document.querySelector('[role=tooltip]'))"));
    assert.equal(await js(`(() => {
      const tooltip = getComputedStyle(document.querySelector('[role=tooltip]'));
      const app = getComputedStyle(document.querySelector('#root .fluent-app-theme'));
      const token = '--colorNeutralBackground1';
      return tooltip.getPropertyValue(token).trim().length > 0 &&
        tooltip.getPropertyValue(token) === app.getPropertyValue(token);
    })()`), true, "Portaled tooltip retains the selected Fluent theme");
    for (let sample = 0; sample < 8; sample++) {
      assert.deepEqual(await js(readLayout), before, "Tooltip hover must preserve the theme, layout, and pointer access to its button");
      assert.equal(await js("Boolean(document.querySelector('[role=tooltip]'))"), true, "Tooltip stays visible while hovered");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    await wait(() => js("document.querySelector('[role=tooltip]') === null"));
    assert.deepEqual(await js(readLayout), before, "Dismissing the tooltip must not change the theme or layout");
  };
  const checkPortfolioCards = async () => {
    assert.deepEqual(await js(`[
      ...document.querySelectorAll('.portfolio-summary-grid > .stat-group')
    ].map(group => [...group.querySelectorAll('.stat-label')].map(label => label.textContent))`), [
      ["Accounts", "Owners", "Milestones", "Monthly use"],
      ["On track", "At risk", "Blocked", "Committed", "Uncommitted"],
      ["Stale accounts", "Failed refreshes", "Unreviewed changes"],
    ], "Exactly three summary cards preserve the requested metric groupings");
    const original = window.getContentSize();
    try {
      for (const width of [original[0], 900, 640]) {
        window.setContentSize(width, original[1]);
        await wait(() => js(`Math.abs(innerWidth - ${width}) < 2`));
        await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await js(`(() => {
          const cards = [...document.querySelectorAll('.account-card')];
          return cards.length === 3 && cards.every(card => {
            const money = card.querySelector('.account-card-monthly-use');
            const owners = money.nextElementSibling;
            const moneyBounds = money.getBoundingClientRect();
            const ownerBounds = owners.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(money.querySelector('.stat-value'));
            return moneyBounds.right <= ownerBounds.left &&
              [...range.getClientRects()].every(rect => rect.left >= moneyBounds.left - 1 && rect.right <= moneyBounds.right + 1);
          });
        })()`), true, `Full monthly-use values stay in their column and never overlap Owners at ${width}px`);
        assert.equal(await js(`(() => {
          const values = [...document.querySelectorAll('.stat-group .stat-value')];
          return values.every(value => {
            const bounds = value.parentElement.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(value);
            return [...range.getClientRects()].every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1);
          });
        })()`), true, `Grouped summary values remain inside their metric at ${width}px`);
      }
    } finally {
      window.setContentSize(...original);
      await wait(() => js(`Math.abs(innerWidth - ${original[0]}) < 2`));
    }
  };
  const clickMetric = async (label) => {
    assert.equal(await js(`(() => {
      const metric = [...document.querySelectorAll('button.stat-metric')]
        .find(button => button.querySelector('.stat-label').textContent === ${JSON.stringify(label)});
      if (!metric) return false;
      metric.click(); return true;
    })()`), true, `Clickable metric: ${label}`);
  };
  app.whenReady().then(async () => {
    const bootstrap = () => {
      const settings = defaultSettings();
      settings.privacyAccepted = privacyAccepted;
      settings.onboardingComplete = configured;
      return {
        auth: { signedIn, name: "Demo Manager", username: "demo@example.invalid", userId: null },
        profile: null,
        settings,
        overview: {
          accounts: configured ? demoAccounts : [],
          totals: Object.fromEntries(["milestones", "atRisk", "blocked", "monthlyUse", "pendingChanges"]
            .map(key => [key, configured ? demoAccounts.reduce((sum, account) => sum + account[key], 0) : 0])),
          scope: settings.scope,
        },
        team: [], pods: [], dataPath: process.env.CSU_SMOKE_DATA, version: "0.3.0",
      };
    };
    ipcMain.handle(IPC.bootstrap, bootstrap);
    ipcMain.handle(IPC.updateSettings, (_event, settings) => {
      privacyAccepted = settings.privacyAccepted;
      return settings;
    });
    ipcMain.handle(IPC.signIn, () => {
      signedIn = true;
      return bootstrap().auth;
    });
    ipcMain.handle(IPC.refreshProfile, () => {
      profileRefreshes++;
      return {
        id: "demo", displayName: "Demo Manager", jobTitle: "Demo role", email: "demo@example.invalid",
        department: null, officeLocation: null, photoDataUrl: null, updatedAt: new Date().toISOString(),
      };
    });
    ipcMain.handle(IPC.listTerritories, () => [demoTerritory]);
    ipcMain.handle(IPC.previewTerritoryImport, (_event, ids) => {
      assert.deepEqual(ids, [demoTerritory.id]);
      return {
        id: "00000000-0000-4000-8000-000000000003", territories: [demoTerritory],
        accounts: [{ id: "smoke-account", name: "Test account", tpid: "000", alreadyPresent: false }],
        alreadyPresent: 0, unresolved: [],
      };
    });
    ipcMain.handle(IPC.importTerritories, async (_event, id) => {
      assert.equal(id, "00000000-0000-4000-8000-000000000003");
      imports++;
      window.webContents.send(IPC.territoryImportProgress, { completed: 0, total: 1, added: 0, skipped: 0, failed: 0 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      configured = true;
      window.webContents.send(IPC.territoryImportProgress, { completed: 1, total: 1, added: 1, skipped: 0, failed: 0 });
      return { added: 1, skipped: 0, failures: [] };
    });
    ipcMain.handle(IPC.getOverview, () => bootstrap().overview);
    ipcMain.handle(IPC.getAccountState, (_event, id) => ({
      milestones: [{
        id: `milestone-${id}`, name: "Demo migration", number: "DEMO-1", date: "2027-01-15",
        status: "On Track", statusValue: 861980000, commitment: "Committed",
        ownerId: "demo-owner", ownerName: "Demo Owner", accountId: id, accountName: "Test account",
        monthlyUse: 1000, monthlyUseFormatted: "$1,000", url: "https://example.invalid/milestone",
      }],
    }));
    ipcMain.handle(IPC.resetSetup, () => {
      resetCalls++;
      signedIn = false;
      configured = false;
      privacyAccepted = false;
      return bootstrap();
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
      width: 1280, height: 900,
      webPreferences: {
        preload: join(root, "dist-main", "preload", "index.js"),
        sandbox: true, contextIsolation: true, nodeIntegration: false,
        offscreen: Boolean(process.env.MCAPS_SMOKE_SCREENSHOT), backgroundThrottling: false,
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
    await wait(() => js("document.body.innerText.includes('Choose your sales territories')"));
    await click("Use manual account lookup");
    await wait(() => js("Boolean(document.querySelector('.scope-editor input'))"));
    assert.equal(await js(`(() => {
      const fields = [...document.querySelectorAll('.scope-editor-grid .fui-Input')].map(e => e.getBoundingClientRect());
      return fields.length === 3 && Math.max(...fields.map(r => r.top)) - Math.min(...fields.map(r => r.top)) < 1 &&
        fields.every((r, i) => i === 0 || r.left >= fields[i - 1].right);
    })()`), true, "Scope label and date controls align without overlap");
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, "-scope.png"));
    }
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
    assert.equal(await js("Boolean(document.querySelector('.fui-FluentProvider'))"), true);
    assert.equal(await js(`(() => {
      const button = document.querySelector('.sidebar-settings');
      const provider = document.querySelector('.fui-FluentProvider');
      return parseFloat(getComputedStyle(button).borderRadius) >= 4 &&
        getComputedStyle(provider).getPropertyValue('--colorBrandBackground').trim().length > 0;
    })()`), true, "Fluent generated styles and theme tokens are permitted by the content policy");
    assert.equal(await js("document.querySelector('.sidebar-brand').innerText.includes('MCAPS Console')"), true);
    assert.equal(await js(`(() => {
      const settings = document.querySelector('.sidebar-settings').getBoundingClientRect();
      const profile = document.querySelector('.sidebar-profile').getBoundingClientRect();
      return settings.top > innerHeight - 190 && profile.bottom <= innerHeight && profile.top > settings.top;
    })()`), true, "Settings and profile stay anchored at the bottom of the rail");
    await checkPortfolioCards();
    await clickMetric("Accounts");
    await wait(() => js("document.querySelector('.metric-drilldown h2')?.textContent === 'Portfolio accounts'"));
    assert.equal(await js("document.querySelectorAll('.metric-drilldown tbody tr').length"), 3);
    await click("Close");
    await clickMetric("On track");
    await wait(() => js("Boolean(document.querySelector('.milestone-table-wrap'))"));
    assert.equal(await js("[...document.querySelectorAll('.milestone-filters select')].some(select => select.value === 'On Track')"), true,
      "Grouped status metric retains its milestone filter");
    await click("Close");
    await clickMetric("Stale accounts");
    await wait(() => js("document.querySelector('.metric-drilldown h2')?.textContent === 'Stale accounts'"));
    assert.equal(await js("document.querySelectorAll('.metric-drilldown tbody tr').length"), 1,
      "Grouped freshness metric preserves its account filtering");
    await click("Close");
    window.webContents.debugger.attach("1.3");
    await hoverThemeToggle();
    const theme = await js("document.documentElement.dataset.theme");
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}.png`));
    }
    await js("document.querySelector('.theme-toggle').click()");
    await wait(() => js(`document.documentElement.dataset.theme !== ${JSON.stringify(theme)}`));
    await checkPortfolioCards();
    await hoverThemeToggle();
    window.webContents.debugger.detach();
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT);
    }
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.updates-panel'))"));
    await wait(() => js("document.querySelector('.settings-profile').innerText.includes('Demo role')"));
    assert.equal(await js("document.body.innerText.includes('Connect Microsoft 365 profile')"), false);
    const refreshesBefore = profileRefreshes;
    await click("Refresh MSX profile");
    await wait(() => profileRefreshes === refreshesBefore + 1);
    assert.equal(await js("document.querySelector('.startup-updates') === null"), true);
    await click("Check for updates");
    await wait(() => js("document.body.innerText.includes('Version 0.4.0 is available')"));
    assert.equal(downloads, 1);
    await click("Reset setup");
    await wait(() => js("Boolean(document.querySelector('[role=dialog]'))"));
    assert.equal(await js(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Reset and start again').disabled`), true);
    await js(`(() => {
      const input = document.querySelector('[role=dialog] input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'RESET');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await wait(() => js(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Reset and start again' && !button.disabled)`));
    await click("Reset and start again");
    await wait(() => js("document.body.innerText.includes('Welcome to MCAPS Console')"));
    assert.equal(resetCalls, 1);
    assert.equal(await js("document.querySelector('.sidebar') === null"), true);
    await js("document.querySelector('input[type=checkbox]').click()");
    await click("Continue");
    await wait(() => js("document.body.innerText.includes('Sign in to MSX')"));
    await click("Sign in with MSX");
    await wait(() => js("document.body.innerText.includes('Choose your sales territories')"));
    await wait(() => js("Boolean(document.querySelector('.territory-groups input[type=checkbox]'))"));
    await js("document.querySelector('.territory-groups input[type=checkbox]').click()");
    await click("Continue with 1 territory");
    await wait(() => js("document.body.innerText.includes('Set your milestone window')"));
    await click("Continue");
    await wait(() => js("document.body.innerText.includes('Review top-parent accounts') && document.body.innerText.includes('TPID 000')"));
    assert.equal(imports, 0, "Preview never imports before confirmation");
    assert.equal(await js("document.querySelector('.app-shell') === null"), true, "Main UI stays gated during onboarding");
    await click("Confirm and import top parents");
    await wait(() => js("document.body.innerText.includes('Import complete')"));
    assert.equal(imports, 1);
    assert.equal(await js("document.querySelector('.app-shell') === null"), true, "Do not exit setup after the first account is added");
    await click("Open workspace");
    await wait(() => js("Boolean(document.querySelector('.app-shell'))"));
    assert.equal(await js("document.querySelector('.sidebar-profile').innerText.includes('Demo role')"), true);
    console.log("MCAPS UI smoke passed: three grouped KPI cards and drilldowns, non-overlapping large currency values at three widths in both themes, stable tooltip hover and click-to-toggle, MSX profiles, aligned dates, updates/dirty guards, retained-data Reset, and full territory-import onboarding.");
    window.destroy();
    app.exit(0);
  }).catch((error) => {
    console.error(error);
    if (window && !window.isDestroyed()) window.destroy();
    app.exit(1);
  });
}
