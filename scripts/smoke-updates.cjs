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
  const root = process.env.MCAPS_UI_SMOKE_APP || join(__dirname, "..");
  const { defaultSettings } = require(join(root, "dist-main", "domain", "defaults.js"));
  const { IPC } = require(join(root, "dist-main", "shared", "ipc.js"));
  const { MSX_ORIGIN } = require(join(root, "dist-main", "main", "msx-client.js"));
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
  let territoryRefreshes = 0;
  let savedSettings = defaultSettings();
  let failSettings = false;
  let milestoneStore;
  let exportedMilestones = [];
  let revealedMilestones = [];
  let milestoneReadFailure = false;
  const openedMilestoneLinks = [];
  const copiedMilestoneLinks = [];
  let failMilestoneCopy = false;
  const demoMilestones = (account) => Array.from({ length: 60 }, (_, index) => ({
    id: `milestone-${account.id}-${index}`, name: `Demo migration ${String(index).padStart(2, "0")} with a long milestone name to resize${index === 0 ? " and additional migration details".repeat(12) : ""}`,
    number: `DEMO-${index}`, date: index < 30 ? "2027-01-15" : "2027-02-15",
    status: index < 40 ? "On Track" : index < 50 ? "At Risk" : "Blocked", statusValue: 861980000,
    statusReason: null, commitment: "Committed", category: null,
    workload: index === 0 ? "Azure services and migration workload details ".repeat(10) : "Azure", milestoneWorkload: "Azure",
    solutionArea: "Infrastructure", helpNeeded: null, azureRegion: index % 2 ? "North Europe" : null, azureCapacityType: null,
    monthlyUse: index - 20, monthlyUseFormatted: String(index - 20), nonRecurringMonths: null,
    forecastComments: index % 2 ? "Needs timeline review" : null, forecastCommentsModifiedOn: null, milestoneComments: null,
    ownerId: index % 2 ? "sam" : "demo-owner", ownerName: index % 2 ? "Sam" : "Demo Owner with a long display name for responsive controls",
    accountId: `child-${account.id}`, accountName: "Actual subsidiary with a long account name ".repeat(8), opportunityId: null, opportunityName: "Demo opportunity",
    opportunityUrl: index === 1 ? null : `${MSX_ORIGIN}/main.aspx?etn=opportunity&id=opportunity-${account.id}-${index}`,
    createdOn: null, createdById: index === 2 ? null : index % 2 ? "creator-two" : "creator-one",
    createdByName: index === 2 ? null : index % 2 ? "Taylor Creator" : "Jordan Creator",
    modifiedOn: null, modifiedByName: null, versionNumber: "1",
    url: index === 2 ? "" : `${MSX_ORIGIN}/main.aspx?etn=msp_engagementmilestone&id=milestone-${account.id}-${index}`,
  }));
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
  const clickAria = async (label) => {
    assert.equal(await js(`(() => {
      const button = [...document.querySelectorAll('.sidebar button')]
        .find(button => button.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!button || button.disabled) return false;
      button.click(); return true;
    })()`), true, `Accessible sidebar button: ${label}`);
  };
  const checkWorkspaceFeatures = async () => {
    const visible = (name) => js(`Boolean(document.querySelector('.sidebar button[aria-label="${name}"]'))`);
    const feature = (index, property) => js(`document.querySelectorAll('.workspace-features input')[${index}].${property}`);
    const toggle = async (index) => js(`document.querySelectorAll('.workspace-features input')[${index}].click()`);
    assert.equal(await visible("Team"), false, "Team is hidden by default");
    assert.equal(await visible("PODs"), true, "PODs is visible by default");
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.workspace-features input'))"));
    assert.equal(await feature(0, "checked"), false);
    assert.equal(await feature(1, "checked"), true);
    assert.equal(await js(`[...document.querySelectorAll('.workspace-features button')].find(b => b.textContent === 'Go to Team').disabled`), true);
    await toggle(0);
    await wait(() => visible("Team"));
    await click("Go to Team");
    await wait(() => js("document.querySelector('h1')?.textContent === 'Team'"));
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.workspace-features input'))"));
    await toggle(1);
    await wait(async () => !await visible("PODs"));
    await window.loadFile(join(root, "dist-renderer", "index.html"));
    await wait(() => js("Boolean(document.querySelector('.sidebar'))"));
    assert.equal(await visible("Team"), true, "Team opt-in survives reload");
    assert.equal(await visible("PODs"), false, "Explicit PODs opt-out survives reload");
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.workspace-features input'))"));
    assert.equal(await feature(0, "checked"), true);
    assert.equal(await feature(1, "checked"), false);
    assert.equal(await js(`[...document.querySelectorAll('.workspace-features button')].find(b => b.textContent === 'Go to PODs').disabled`), true);
    failSettings = true;
    try {
      await toggle(0);
      await wait(() => js("document.body.innerText.includes('Synthetic settings save failed.')"));
      assert.equal(await visible("Team"), true, "A failed save does not hide Team");
      assert.equal(await feature(0, "checked"), true, "Failed checkbox save retains its persisted value");
    } finally { failSettings = false; }
    await wait(async () => !await feature(0, "disabled"));
    await toggle(0);
    await wait(async () => !await visible("Team"));
    assert.equal(await visible("PODs"), false, "Both optional pages can be hidden");
    await toggle(0);
    await wait(() => visible("Team"));
    await toggle(1);
    await wait(() => visible("PODs"));
    console.log("Feature switches passed: defaults, immediate menu visibility, page links, persistence and failed-save feedback.");
  };
  const checkCollapsedSidebar = async () => {
    const original = window.getContentSize();
    const expandedWidth = await js("document.querySelector('.app-main').getBoundingClientRect().width");
    await clickAria("Minimize sidebar");
    await wait(() => js("Boolean(document.querySelector('.sidebar-collapsed'))"));
    assert.ok(await js("document.querySelector('.app-main').getBoundingClientRect().width") > expandedWidth,
      "Collapsing the sidebar gives the page more usable width");
    assert.equal(await js("localStorage.getItem('csu-console-sidebar-collapsed')"), "true");
    try {
      for (const width of [original[0], 900, 640]) {
        window.setContentSize(width, original[1]);
        await wait(() => js(`Math.abs(innerWidth - ${width}) < 2`));
        await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await js(`(() => {
          const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
          const page = document.querySelector('.app-content');
          return sidebar.width === 80 && [...document.querySelectorAll('.sidebar button')].every(button => {
            const rect = button.getBoundingClientRect();
            return rect.width >= 40 && rect.height >= 40 && rect.left >= sidebar.left && rect.right <= sidebar.right &&
              Boolean(button.getAttribute('aria-label'));
          }) && document.scrollingElement.scrollWidth <= innerWidth && page.scrollWidth <= page.clientWidth;
        })()`), true, `Collapsed rail has accessible, contained click targets and no page overflow at ${width}px`);
      }
    } finally {
      window.setContentSize(...original);
      await wait(() => js(`Math.abs(innerWidth - ${original[0]}) < 2`));
    }
    for (const label of ["Milestones", "Team", "PODs", "Settings"]) {
      await clickAria(label);
      await wait(() => js(`document.querySelector('h1')?.textContent === ${JSON.stringify(label)}`));
      assert.equal(await js(`document.querySelector('.sidebar button[aria-label="${label}"]').getAttribute('aria-current')`), "page");
    }
    await window.loadFile(join(root, "dist-renderer", "index.html"));
    await wait(() => js("Boolean(document.querySelector('.sidebar-collapsed'))"));
    assert.equal(await js("document.querySelector('.sidebar-collapse').getAttribute('aria-expanded')"), "false");
    await clickAria("Settings");
    await wait(() => js("Boolean(document.querySelector('.appearance-settings input'))"));
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      const theme = await js("document.documentElement.dataset.theme");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-sidebar.png`));
    }
    await clickAria("Expand sidebar");
    await wait(() => js("document.querySelector('.sidebar-collapsed') === null"));
    assert.equal(await js("localStorage.getItem('csu-console-sidebar-collapsed')"), "false");
    await click("Portfolio");
    await wait(() => js("Boolean(document.querySelector('.portfolio-summary-grid'))"));
  };
  const setMilestoneField = async (label, value) => {
    assert.ok(await js(`(() => {
      const field = [...document.querySelectorAll('.milestone-table-wrap .field')]
        .find(field => field.querySelector('label')?.textContent.trim() === ${JSON.stringify(label)});
      const control = field?.querySelector('input,select');
      if (!control) return false;
      const prototype = control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      return true;
    })()`), `Milestone control: ${label}`);
  };
  const checkMilestoneWorkspace = async () => {
    await clickAria("Milestones");
    await wait(() => js("document.querySelectorAll('.milestones-page [data-milestone-id]').length === 50"));
    assert.equal(await js(`(() => {
      const summary = document.querySelector('[data-milestone-id] .milestone-name-summary');
      const [name, account, workload] = summary.children;
      const bounded = (element, lines) => element.clientHeight <= parseFloat(getComputedStyle(element).lineHeight) * lines + 1 &&
        element.scrollHeight > element.clientHeight && element.title.includes(element.textContent.trim());
      return bounded(name, 2) && bounded(account, 1) && bounded(workload, 1) &&
        account.textContent.trim().startsWith('Actual subsidiary') &&
        workload.textContent.trim().startsWith('Azure services') &&
        getComputedStyle(account).fontWeight === '600' &&
        getComputedStyle(workload).fontStyle === 'italic' &&
        getComputedStyle(account).color !== getComputedStyle(workload).color;
    })()`), true, "Long names and account/workload sublines clamp at their line limits with full-value tooltips");
    const firstLinks = await js(`(() => {
      const row = document.querySelector('[data-milestone-id]');
      const links = [...row.querySelectorAll('.milestone-row-actions a')];
      return { labels: links.map(link => link.textContent), urls: links.map(link => link.href),
        header: document.querySelector('.milestone-grid th:last-child').textContent };
    })()`);
    assert.deepEqual(firstLinks.labels, ["Milestone", "Opportunity"]);
    assert.equal(firstLinks.header, "Links & details");
    const openedBefore = openedMilestoneLinks.length;
    await js(`document.querySelector('[data-milestone-id] .milestone-row-actions a').click()`);
    await wait(() => openedMilestoneLinks.length === openedBefore + 1);
    await js(`document.querySelectorAll('[data-milestone-id] .milestone-row-actions a')[1].click()`);
    await wait(() => openedMilestoneLinks.length === openedBefore + 2);
    assert.deepEqual(openedMilestoneLinks.slice(openedBefore), firstLinks.urls);
    const waitCopyMenu = async () => {
      await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await wait(() => js(`(() => {
        const item = [...document.querySelectorAll('[role=menuitem]')].find(item => item.textContent === 'Copy to clipboard');
        const surface = item?.closest('.fui-MenuPopover');
        if (!surface) return false;
        const rect = item.getBoundingClientRect();
        const style = getComputedStyle(surface);
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        for (let ancestor = item; ancestor; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (Number(ancestorStyle.opacity) < 0.99 || ancestorStyle.visibility !== 'visible' ||
            ancestorStyle.display === 'none' || ancestor.getAnimations().some(animation => animation.playState === 'running' || animation.playState === 'pending')) return false;
        }
        return rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0 &&
          rect.right <= innerWidth && rect.bottom <= innerHeight && item.contains(target) &&
          style.visibility === 'visible' && Number(style.opacity) >= 0.99 &&
          surface.getAnimations({subtree:true}).every(animation => animation.playState !== 'running' && animation.playState !== 'pending');
      })()`));
    };
    const openCopyMenu = async index => {
      const point = await js(`(() => {
        const link = document.querySelectorAll('[data-milestone-id] .milestone-row-actions a')[${index}];
        link.scrollIntoView({block:'center', inline:'center'});
        const rect = link.getBoundingClientRect();
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
      })()`);
      await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "right", buttons: 2, clickCount: 1 });
      await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "right", buttons: 0, clickCount: 1 });
      await waitCopyMenu();
    };
    const selectCopy = async () => {
      await js(`[...document.querySelectorAll('[role=menuitem]')].find(item => item.textContent === 'Copy to clipboard').click()`);
      await wait(() => js("document.querySelectorAll('[role=menuitem]').length === 0"));
    };
    const copiedBefore = copiedMilestoneLinks.length;
    await openCopyMenu(0);
    await selectCopy();
    await wait(() => copiedMilestoneLinks.length === copiedBefore + 1);
    assert.equal(copiedMilestoneLinks.at(-1), firstLinks.urls[0]);
    await wait(() => js("[...document.querySelectorAll('.toast-positive')].some(toast => toast.textContent.includes('Milestone link copied.'))"));
    await openCopyMenu(1);
    await selectCopy();
    await wait(() => copiedMilestoneLinks.length === copiedBefore + 2);
    assert.equal(copiedMilestoneLinks.at(-1), firstLinks.urls[1], "Opportunity context menu copies the opportunity URL, not the milestone URL");
    await js(`[...document.querySelectorAll('[aria-label="Dismiss notification"]')].forEach(button => button.click())`);
    await js("document.querySelector('[data-milestone-id] .milestone-row-actions a').focus()");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "F10", modifiers: ["shift"] });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "F10", modifiers: ["shift"] });
    await waitCopyMenu();
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      const theme = await js("document.documentElement.dataset.theme");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-link-menu.png`));
    }
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" });
    await wait(() => js("document.querySelectorAll('[role=menuitem]').length === 0"));
    assert.equal(copiedMilestoneLinks.length, copiedBefore + 2, "Dismissing a context menu does not change the clipboard");
    failMilestoneCopy = true;
    await openCopyMenu(0);
    await selectCopy();
    await wait(() => js("document.body.innerText.includes('Synthetic clipboard failure.')"));
    failMilestoneCopy = false;
    assert.equal(await js(`(() => {
      const row = [...document.querySelectorAll('[data-milestone-id]')].find(row => row.dataset.milestoneId.endsWith('-2'));
      return row.querySelector('.milestone-row-actions').textContent.includes('No milestone link') &&
        !row.querySelector('.milestone-row-actions a[href*="engagementmilestone"]');
    })()`), true, "Missing milestone links cannot be opened or copied");
    assert.equal(await js(`(() => {
      const controls = document.querySelector('.milestone-grid-toolbar');
      const select = controls.querySelector('select').getBoundingClientRect();
      return [...controls.querySelectorAll('button')].every(button => Math.abs(button.getBoundingClientRect().bottom - select.bottom) <= 1);
    })()`), true, "Toolbar buttons align with the Freeze column dropdown rather than its label");
    assert.deepEqual(await js(`[...document.querySelectorAll('.sidebar-list button')].slice(0,3).map(button => button.getAttribute('aria-label').split(',')[0])`),
      ["Portfolio", "Milestones", "All Changes"]);
    assert.equal(await js(`(() => {
      const columns = [...document.querySelectorAll('.milestone-grid th')].map(header => header.dataset.column);
      return columns.indexOf('createdByName') === columns.indexOf('ownerName') + 1 &&
        document.querySelector('[data-milestone-id] td[data-column=createdByName]').textContent === 'Jordan Creator';
    })()`), true, "Raised By appears after Owner and displays the actual creator");
    await setMilestoneField("Search milestones", "Jordan Creator");
    await wait(() => js("document.querySelector('.milestone-count').textContent.includes('Showing 87 of 180')"));
    await click("Clear filters");
    await js(`(() => {
      const field = [...document.querySelectorAll('.milestone-facet')].find(field => field.querySelector('label').textContent === 'Raised By');
      const input = field.querySelector('input');
      input.focus(); input.click();
    })()`);
    await wait(() => js("Boolean(document.querySelector('[role=menuitemcheckbox]'))"));
    await js(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find(option => option.textContent.startsWith('Jordan Creator (')).click()`);
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" });
    await wait(() => js("document.querySelector('.milestone-count').textContent.includes('Showing 87 of 180')"));
    await setMilestoneField("Group by", "creator");
    await setMilestoneField("Order by", "createdByName");
    await wait(() => js("document.querySelector('.milestone-group-row')?.textContent.includes('Jordan Creator')"));
    const beforeCreatorExport = exportedMilestones.length;
    await click("Export Excel");
    await wait(() => exportedMilestones.length === beforeCreatorExport + 1);
    assert.equal(exportedMilestones.at(-1).rowCount, 87, "Creator-filtered export uses the same identities as the grid");
    await click("Clear filters");
    await setMilestoneField("Group by", "");
    await setMilestoneField("Search milestones", "TIMELINE");
    await wait(() => js("document.querySelector('.milestone-count').textContent.includes('Showing 90 of 180')"));
    await setMilestoneField("Group by", "owner");
    await setMilestoneField("Then group by 2", "month");
    await setMilestoneField("Order by", "monthlyUse");
    await setMilestoneField("Sort direction", "desc");
    await wait(() => js("document.querySelectorAll('.milestone-group-row').length >= 2"));
    await click("Collapse all");
    await wait(() => js("document.querySelectorAll('[data-milestone-id]').length === 0"));
    const before = exportedMilestones.length;
    await click("Export Excel");
    await wait(() => exportedMilestones.length === before + 1);
    assert.equal(exportedMilestones.at(-1).rowCount, 90, "Export includes every page and every collapsed group");
    assert.equal(revealedMilestones.at(-1), exportedMilestones.at(-1).path, "Completed export requests reveal of the downloaded workbook");
    await wait(() => js("document.querySelector('.milestone-export-result')?.textContent.includes('Saved 90')"));
    const ExcelJS = require(join(root, "node_modules", "exceljs"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exportedMilestones.at(-1).path);
    assert.equal(workbook.getWorksheet("Milestones").rowCount, 91);
    const exportSheet = workbook.getWorksheet("Milestones");
    const creatorColumn = exportSheet.getRow(1).values.indexOf("Raised By");
    const creatorIdColumn = exportSheet.getRow(1).values.indexOf("Raised By (MSX user ID)");
    assert.ok(creatorColumn > 0 && creatorIdColumn > 0, "Workbook includes creator names and source IDs");
    for (let row = 2; row <= exportSheet.rowCount; row++) {
      assert.equal(exportSheet.getCell(row, creatorColumn).value, "Taylor Creator");
      assert.equal(exportSheet.getCell(row, creatorIdColumn).value, "creator-two");
    }
    await click("Expand all");
    await wait(() => js("document.querySelectorAll('[data-milestone-id]').length === 50"));
    await setMilestoneField("Minimum monthly use", "1e");
    await wait(() => js("Boolean(document.querySelector('.field-error'))"));
    assert.equal(await js(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Export Excel').disabled`), true,
      "Incomplete numeric bounds remain invalid rather than becoming an empty filter");
    await setMilestoneField("Minimum monthly use", "20");
    await setMilestoneField("Maximum monthly use", "10");
    await wait(() => js("document.querySelector('.field-error')?.textContent.includes('Minimum')"));
    assert.equal(await js(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Export Excel').disabled`), true);
    await click("Clear filters");
    await setMilestoneField("Group by", "");
    await wait(() => js("document.querySelectorAll('[data-milestone-id]').length === 50"));
    await js(`(() => {
      const field = [...document.querySelectorAll('.milestone-facet')].find(field => field.querySelector('label').textContent === 'Status');
      const input = field.querySelector('input');
      input.focus(); input.click();
    })()`);
    await wait(() => js("Boolean(document.querySelector('[role=menuitemcheckbox]'))"));
    await js(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find(option => option.textContent.startsWith('Blocked (')).click()`);
    await wait(() => js("document.querySelector('.milestone-count').textContent.includes('Showing 30 of 180')"));
    await js(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find(option => option.textContent.startsWith('At Risk (')).click()`);
    await wait(() => js("document.querySelector('.milestone-count').textContent.includes('Showing 60 of 180')"));
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" });
    await click("Clear filters");
    await wait(() => js("document.querySelector('.milestone-count').textContent.includes('Showing 180 of 180')"));
    await js("document.querySelector('.milestone-grid-scroll').scrollIntoView({block:'start'})");
    await js(`document.querySelector('[aria-label="Resize Milestone column"]').focus()`);
    const originalWidth = await js(`Number(document.querySelector('[aria-label="Resize Milestone column"]').getAttribute('aria-valuenow'))`);
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
    await wait(() => js(`Number(document.querySelector('[aria-label="Resize Milestone column"]').getAttribute('aria-valuenow')) === ${originalWidth + 10}`));
    const grip = await js(`(() => {
      const r = document.querySelector('[aria-label="Resize Milestone column"]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", ...grip, button: "left", clickCount: 1 });
    await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: grip.x + 70, y: grip.y, button: "left", buttons: 1 });
    await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", x: grip.x + 70, y: grip.y, button: "left", clickCount: 1 });
    await wait(() => js(`Number(document.querySelector('[aria-label="Resize Milestone column"]').getAttribute('aria-valuenow')) >= ${originalWidth + 70}`));
    assert.equal(await js("JSON.parse(localStorage.getItem('csu-console-milestone-columns-v1')).widths.name"), originalWidth + 80);
    const original = window.getContentSize();
    try {
      for (const width of [original[0], 900, 640]) {
        window.setContentSize(width, original[1]);
        await wait(() => js(`Math.abs(innerWidth - ${width}) < 2`));
        await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await js(`(async () => {
          const scroll = document.querySelector('.milestone-grid-scroll');
          const pinned = scroll.querySelector('td.milestone-pinned');
          scroll.scrollLeft = 0;
          const left = pinned.getBoundingClientRect().left;
          scroll.scrollLeft = 300;
          await new Promise(resolve => requestAnimationFrame(resolve));
          return Math.abs(pinned.getBoundingClientRect().left - left) <= 1 &&
            pinned.getBoundingClientRect().width <= scroll.clientWidth - 80 &&
            document.scrollingElement.scrollWidth <= innerWidth &&
            scroll.scrollHeight <= scroll.clientHeight + 1;
        })()`), true, `Pinned column stays visible without covering the viewport or adding vertical table scrolling at ${width}px`);
      }
    } finally { window.setContentSize(...original); await wait(() => js(`Math.abs(innerWidth - ${original[0]}) < 2`)); }
    await setMilestoneField("Freeze column", "none");
    await wait(() => js("document.querySelectorAll('.milestone-pinned').length === 0"));
    await setMilestoneField("Freeze column", "number");
    await wait(() => js("document.querySelector('.milestone-grid th').dataset.column === 'number'"));
    await click("Portfolio");
    await clickAria("Milestones");
    await wait(() => js("document.querySelector('.milestone-grid th')?.dataset.column === 'number'"));
    assert.equal(await js("JSON.parse(localStorage.getItem('csu-console-milestone-columns-v1')).widths.name"), originalWidth + 80);
    await click("Columns");
    await wait(() => js("document.querySelectorAll('.milestone-column-choices input').length === 15"));
    await js(`['name', 'ownerName', 'actions'].forEach(key => document.querySelector('[name="milestone-column-' + key + '"]').click())`);
    await wait(() => js("!document.querySelector('.milestone-grid th[data-column=name]') && !document.querySelector('.milestone-grid th[data-column=ownerName]') && !document.querySelector('.milestone-row-actions')"));
    await click("Columns");
    await setMilestoneField("Search milestones", "TIMELINE");
    await setMilestoneField("Group by", "month");
    await setMilestoneField("Order by", "monthlyUse");
    await setMilestoneField("Sort direction", "desc");
    await wait(() => js("document.querySelector('.milestone-count').textContent.includes('Showing 90 of 180')"));
    const beforeHiddenExport = exportedMilestones.length;
    await click("Export Excel");
    await wait(() => exportedMilestones.length === beforeHiddenExport + 1);
    await workbook.xlsx.readFile(exportedMilestones.at(-1).path);
    assert.ok(workbook.getWorksheet("Milestones").getRow(1).values.includes("Owner"), "Hidden columns remain in the full-data export");
    await window.loadFile(join(root, "dist-renderer", "index.html"));
    await wait(() => js("Boolean(document.querySelector('.sidebar'))"));
    await clickAria("Milestones");
    await wait(() => js("document.querySelector('.milestone-grid th')?.dataset.column === 'number'"));
    assert.equal(await js(`(() => {
      const saved = JSON.parse(localStorage.getItem('csu-console-milestone-columns-v1'));
      return saved.frozen === 'number' && saved.widths.name === ${originalWidth + 80} &&
        ['name','ownerName','actions'].every(key => saved.hidden.includes(key)) &&
        !document.querySelector('.milestone-grid th[data-column=name]') &&
        !document.querySelector('.milestone-grid th[data-column=ownerName]') &&
        !document.querySelector('.milestone-row-actions') &&
        document.querySelector('.milestone-count').textContent.includes('Showing 180 of 180');
    })()`), true, "Full renderer reload restores column visibility, widths and freeze without remembering row filters");
    assert.equal(await js(`[...document.querySelectorAll('.milestone-search input')][0].value`), "");
    await click("Columns");
    await wait(() => js("Boolean(document.querySelector('[name=milestone-column-name]'))"));
    await js(`document.querySelector('[name=milestone-column-name]').click()`);
    await wait(() => js(`document.querySelector('[aria-label="Resize Milestone column"]')?.getAttribute('aria-valuenow') === '${originalWidth + 80}'`));
    await js(`document.querySelector('[name=milestone-column-number]').click()`);
    await wait(() => js("document.querySelectorAll('.milestone-pinned').length === 0"));
    assert.equal(await js("JSON.parse(localStorage.getItem('csu-console-milestone-columns-v1')).frozen"), "number",
      "Hiding the frozen column retains its preference for when it is shown again");
    await js(`document.querySelector('[name=milestone-column-number]').click()`);
    await wait(() => js("document.querySelector('.milestone-grid th')?.classList.contains('milestone-pinned')"));
    await js(`[...document.querySelectorAll('.milestone-column-choices input')].filter(input => input.checked && input.name !== 'milestone-column-number').forEach(input => input.click())`);
    await wait(() => js("document.querySelectorAll('.milestone-column-choices input:checked').length === 1"));
    assert.equal(await js("document.querySelector('[name=milestone-column-number]').disabled"), true, "The last visible column cannot be hidden");
    await click("Columns");
    await click("Reset columns");
    await wait(() => js("document.querySelector('.milestone-grid th').dataset.column === 'name' && document.querySelectorAll('.milestone-grid th').length === 15"));
    await js("document.querySelector('.milestone-grid-scroll').scrollIntoView({block:'start'})");
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      await js(`[...document.querySelectorAll('[aria-label="Dismiss notification"]')].forEach(button => button.click())`);
      await wait(() => js(`document.querySelectorAll('[aria-label="Dismiss notification"]').length === 0`));
      const theme = await js("document.documentElement.dataset.theme");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-milestones.png`));
      await js("document.querySelector('.app-content').scrollTop = 0");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-filters.png`));
    }
    milestoneReadFailure = true;
    await click("Reload saved data");
    await wait(() => js("document.body.innerText.includes('Synthetic saved-data read failed.')"));
    assert.equal(await js("document.querySelectorAll('[data-milestone-id]').length"), 50, "A failed reload retains explicitly stale displayed rows instead of pretending there are none");
    milestoneReadFailure = false;
    await click("Reload saved data");
    await wait(() => js("!document.body.innerText.includes('Synthetic saved-data read failed.')"));
    await click("Portfolio");
    await wait(() => js("Boolean(document.querySelector('.portfolio-summary-grid'))"));
    console.log("Milestone workspace passed: multi-select search/filter/group/sort, collapsed full-result XLSX export/reveal, validation, resize, pinning and persistence.");
  };
  const checkSettingsLayout = async () => {
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.appearance-settings input'))"));
    assert.equal(await js("document.querySelector('.sidebar .theme-toggle') === null"), true, "Theme controls live only inside Settings");
    const original = window.getContentSize();
    try {
      for (const width of [original[0], 900, 640]) {
        window.setContentSize(width, original[1]);
        await wait(() => js(`Math.abs(innerWidth - ${width}) < 2`));
        await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await js(`(() => {
          const page = document.querySelector('.settings-page').getBoundingClientRect();
          return [...document.querySelectorAll('.settings-page > .settings-section')].every(card => {
            const rect = card.getBoundingClientRect();
            return Math.abs(rect.width - page.width) <= 1;
          }) && [...document.querySelectorAll('.settings-page .fact-row dd')].every(value => {
            const bounds = value.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(value);
            return [...range.getClientRects()].every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1);
          }) && [...document.querySelectorAll('.workspace-feature')].every(feature => {
            const copy = feature.querySelector('div').getBoundingClientRect();
            const button = feature.querySelector('button').getBoundingClientRect();
            return button.left >= copy.right - 1 || button.top >= copy.bottom - 1;
          }) && document.querySelector('.app-content').scrollWidth <= document.querySelector('.app-content').clientWidth;
        })()`), true, `Settings cards fill the page and long update/data values do not overlap at ${width}px`);
      }
    } finally {
      window.setContentSize(...original);
      await wait(() => js(`Math.abs(innerWidth - ${original[0]}) < 2`));
    }
    await js("document.querySelector('.app-content').scrollTop = 0");
    const readLayout = `(() => {
      const button = document.querySelector('.appearance-settings label').getBoundingClientRect();
      return {
        theme: document.documentElement.dataset.theme,
        savedTheme: localStorage.getItem('csu-console-theme'),
        height: document.scrollingElement.scrollHeight,
        width: document.scrollingElement.scrollWidth,
        button: { x: button.x, y: button.y, width: button.width, height: button.height },
      };
    })()`;
    const before = await js(readLayout);
    await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved", x: before.button.x + before.button.width / 2, y: before.button.y + before.button.height / 2,
    });
    for (let sample = 0; sample < 3; sample++) {
      assert.deepEqual(await js(readLayout), before, "Hovering Appearance must not change theme or layout");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      const theme = await js("document.documentElement.dataset.theme");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-settings.png`));
      await js("document.querySelector('.workspace-features').scrollIntoView({ block: 'center' })");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-features.png`));
      await js("document.querySelector('.app-content').scrollTop = 0");
    }
    await click("Portfolio");
    await wait(() => js("Boolean(document.querySelector('.portfolio-summary-grid'))"));
  };
  const checkAiConnections = async () => {
    const setModel = async (value) => {
      await js(`(() => {
        const input = document.querySelectorAll('.ai-connections input')[1];
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await wait(() => js(`document.querySelectorAll('.ai-connections input')[1].value === ${JSON.stringify(value)}`));
    };
    const workiqLocked = () => js("document.querySelector('.workiq-connections fieldset').disabled");
    assert.equal(await workiqLocked(), true);
    await click("Test AI access");
    await wait(() => js("Boolean(document.querySelector('.ai-connections .connection-success'))"));
    assert.equal(await workiqLocked(), false);
    assert.equal(await js("document.querySelector('.connection-response').textContent.includes('MCAPS_AI_OK')"), true);
    await click("Test Work IQ access");
    await wait(() => js("Boolean(document.querySelector('.workiq-connections .connection-success'))"));
    await setModel("fail-test");
    await wait(workiqLocked);
    await click("Test AI access");
    await wait(() => js("Boolean(document.querySelector('.ai-connections .connection-error'))"));
    assert.equal(await workiqLocked(), true, "Failed AI retest invalidates Work IQ");
    await setModel("slow-test");
    await click("Test AI access");
    await wait(() => js("document.body.innerText.includes('Calling the LLM')"));
    await click("Stop connection test");
    await wait(() => js("Boolean(document.querySelector('.connection-cancelled'))"));
    assert.equal(await workiqLocked(), true, "Cancelled tests cannot unlock Work IQ");
    await setModel("");
    await click("Test AI access");
    await wait(() => js("Boolean(document.querySelector('.ai-connections .connection-success'))"));
  };
  const checkPortfolioCards = async () => {
    await wait(() => js("document.querySelectorAll('.territory-account-group').length === 2"));
    assert.deepEqual(await js(`[...document.querySelectorAll('.territory-account-group')].map(group => ({
      name: group.querySelector('.territory-name').textContent,
      accounts: [...group.querySelectorAll('.account-card-title')].map(name => name.textContent),
    }))`), [
      { name: "Demo.FinancialServices.001", accounts: ["Test account", "Demo Financial Services"] },
      { name: "Demo.FinancialServices.002", accounts: ["Example Holdings"] },
    ], "Accounts appear once under their canonical MSX territory");
    assert.equal(await js(`(() => {
      const heading = document.querySelector('.territory-name');
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(heading);
      selection.removeAllRanges();
      selection.addRange(range);
      const selectable = getComputedStyle(heading).userSelect === 'text' && selection.toString() === heading.textContent;
      selection.removeAllRanges();
      return selectable;
    })()`), true, "Territory names are selectable text that can be copied without modifying the clipboard");
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
  const checkAllChangesSpacing = async () => {
    await js("[...document.querySelectorAll('.sidebar button')].find(button => button.textContent.trim().startsWith('All Changes')).click()");
    await wait(() => js("document.querySelectorAll('.account-changes-panel .changes-toolbar').length === 2"));
    const original = window.getContentSize();
    try {
      for (const width of [original[0], 900, 640]) {
        window.setContentSize(width, original[1]);
        await wait(() => js(`Math.abs(innerWidth - ${width}) < 2`));
        await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await js(`(() => [...document.querySelectorAll('.account-changes-panel')].every(panel => {
          const header = panel.querySelector('summary').getBoundingClientRect();
          const action = panel.querySelector('.changes-toolbar button').getBoundingClientRect();
          const hint = panel.querySelector('.changes-toolbar .field-hint').getBoundingClientRect();
          const bounds = panel.getBoundingClientRect();
          return action.top >= header.bottom + 15 && hint.top >= header.bottom + 15 &&
            [...panel.querySelectorAll('summary > *, .changes-toolbar > *')].every(element => {
              const rect = element.getBoundingClientRect();
              return rect.left >= bounds.left + 15 && rect.right <= bounds.right - 15;
            }) && panel.querySelector('summary button').classList.contains('fui-Button');
        }))()`), true, `All Changes actions have breathing room, consistent Fluent styling, and fit their card at ${width}px`);
      }
    } finally {
      window.setContentSize(...original);
      await wait(() => js(`Math.abs(innerWidth - ${original[0]}) < 2`));
    }
    await js("document.querySelector('.app-content').scrollTop = 0");
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      const theme = await js("document.documentElement.dataset.theme");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-changes.png`));
    }
    await js("document.querySelector('.account-changes-panel > summary').click()");
    assert.equal(await js("document.querySelector('.account-changes-panel').open"), false, "Account summary still collapses");
    await js("document.querySelector('.account-changes-panel > summary').click()");
    assert.equal(await js("document.querySelector('.account-changes-panel').open"), true, "Account summary still expands");
    await click("Portfolio");
    await wait(() => js("Boolean(document.querySelector('.portfolio-summary-grid'))"));
  };
  const clickMetric = async (label) => {
    assert.equal(await js(`(() => {
      const metric = [...document.querySelectorAll('button.stat-metric')]
        .find(button => button.querySelector('.stat-label').textContent === ${JSON.stringify(label)});
      if (!metric) return false;
      metric.click(); return true;
    })()`), true, `Clickable metric: ${label}`);
  };
  const checkOwnerScrolling = async () => {
    await clickMetric("Owners");
    await wait(() => js("document.querySelectorAll('.metric-drilldown tbody tr').length >= 20"));
    const original = window.getContentSize();
    try {
      for (const width of [original[0], 900, 640]) {
        window.setContentSize(width, original[1]);
        await wait(() => js(`Math.abs(innerWidth - ${width}) < 2`));
        await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await js(`(() => {
          const filters = document.querySelector('.milestone-filters');
          return [...filters.querySelectorAll('.field')].every(field => {
            const cell = field.getBoundingClientRect();
            return [...field.querySelectorAll('.fui-Select, select, .fui-Input, .fui-Combobox')].every(control => {
              const rect = control.getBoundingClientRect();
              return rect.left >= cell.left - 1 && rect.right <= cell.right + 1;
            });
          });
        })()`), true, `Owners filters stay within their grid cells at ${width}px`);
        const scrollState = await js(`(async () => {
          const root = document.scrollingElement;
          const page = document.querySelector('.app-content');
          const table = document.querySelector('.metric-drilldown .table-scroll');
          const fixed = [...document.querySelectorAll('.app-topbar, .sidebar, .app-statusbar')];
          page.scrollTop = 0;
          const before = fixed.map(element => element.getBoundingClientRect().top);
          page.scrollTop = page.scrollHeight;
          table.scrollLeft = 100;
          await new Promise(resolve => requestAnimationFrame(resolve));
          const result = {
            documentHeightContained: root.scrollHeight <= root.clientHeight + 1,
            documentWidthContained: root.scrollWidth <= root.clientWidth + 1,
            documentStationary: root.scrollTop === 0 && root.scrollLeft === 0,
            pageScrollsVertically: page.scrollTop > 0 && page.scrollLeft === 0,
            shellStationary: fixed.every((element, index) => element.getBoundingClientRect().top === before[index]),
            tableHasNoVerticalOverflow: table.scrollHeight <= table.clientHeight + 1,
            tableCanScrollHorizontallyWhenNeeded: table.scrollWidth <= table.clientWidth + 1 || table.scrollLeft > 0,
          };
          page.scrollTop = 0;
          return result;
        })()`);
        assert.deepEqual(scrollState, {
          documentHeightContained: true, documentWidthContained: true, documentStationary: true,
          pageScrollsVertically: true, shellStationary: true, tableHasNoVerticalOverflow: true,
          tableCanScrollHorizontallyWhenNeeded: true,
        }, `Only the page scrolls vertically, the table scrolls horizontally when needed, and shell chrome stays fixed at ${width}px`);
      }
    } finally {
      window.setContentSize(...original);
      await wait(() => js(`Math.abs(innerWidth - ${original[0]}) < 2`));
    }
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      const theme = await js("document.documentElement.dataset.theme");
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}-owners.png`));
    }
    await click("Close");
  };
  app.whenReady().then(async () => {
    const { VaultStore } = require(join(root, "dist-main", "main", "storage", "vault.js"));
    const { PortfolioService } = require(join(root, "dist-main", "main", "portfolio-service.js"));
    const { MilestoneExporter } = require(join(root, "dist-main", "main", "milestone-export.js"));
    const { milestoneExportSchema, msxLinkSchema } = require(join(root, "dist-main", "main", "ipc.js"));
    ipcMain.handle(IPC.openExternal, (_event, url) => { openedMilestoneLinks.push(msxLinkSchema.parse(url)); });
    ipcMain.handle(IPC.copyMsxLink, (_event, url) => {
      const parsed = msxLinkSchema.parse(url);
      if (failMilestoneCopy) throw new Error("Synthetic clipboard failure.");
      copiedMilestoneLinks.push(parsed);
    });
    milestoneStore = new VaultStore(join(process.env.CSU_SMOKE_DATA, "milestone-vault"));
    const milestoneService = new PortfolioService(milestoneStore, {}, {}, "smoke-test");
    milestoneStore.put("settings", "default", savedSettings);
    for (const account of demoAccounts) {
      milestoneStore.put("portfolio-account", account.id, account);
      milestoneStore.put(`current:${account.id}`, "milestones", demoMilestones(account));
    }
    const downloadPath = join(process.env.CSU_SMOKE_DATA, "Downloads");
    require("node:fs").mkdirSync(downloadPath);
    const milestoneExporter = new MilestoneExporter(ids => milestoneService.getMilestones(ids), () => downloadPath,
      path => { revealedMilestones.push(path); });
    ipcMain.handle(IPC.getMilestones, () => {
      if (milestoneReadFailure) throw new Error("Synthetic saved-data read failed.");
      return milestoneService.getMilestones();
    });
    ipcMain.handle(IPC.exportMilestones, async (event, request) => {
      assert.equal(event.sender, window.webContents);
      assert.equal(event.senderFrame, window.webContents.mainFrame);
      const result = await milestoneExporter.export(milestoneExportSchema.parse(request));
      exportedMilestones.push(result);
      return result;
    });
    const { AiService, ConnectionError } = require(join(root, "dist-main", "main", "ai-service.js"));
    let aiPreferences = null;
    const aiService = new AiService({
      get: () => aiPreferences,
      put: (_kind, _id, value) => { aiPreferences = value; },
      delete: () => { aiPreferences = null; },
    }, {
      ai: async (config, signal) => {
        if (config.model === "fail-test") throw new ConnectionError("Synthetic provider refusal.");
        if (config.model === "slow-test") await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
        return { response: "MCAPS_AI_OK_SYNTHETIC", identity: "demo-login", details: "Synthetic UI fixture; actual calls are tested separately." };
      },
      workiq: async () => ({ response: "MCAPS_WORKIQ_OK_SYNTHETIC", identity: null, details: "Synthetic UI fixture." }),
    });
    ipcMain.handle(IPC.aiConnections, () => aiService.getState());
    ipcMain.handle(IPC.aiTest, (_event, config) => aiService.testAi(config));
    ipcMain.handle(IPC.workiqTest, (_event, config) => aiService.testWorkiq(config));
    ipcMain.handle(IPC.aiCancel, () => aiService.cancel());
    const bootstrap = () => {
      const settings = { ...savedSettings };
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
      if (failSettings) throw new Error("Synthetic settings save failed.");
      savedSettings = settings;
      milestoneStore.put("settings", "default", settings);
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
    ipcMain.handle(IPC.refreshAccountTerritories, () => {
      territoryRefreshes++;
      demoAccounts.forEach((account, index) => {
        account.territory = {
          id: index < 2 ? demoTerritory.id : "00000000-0000-0000-0000-000000000002",
          name: index < 2 ? "Demo.FinancialServices.001" : "Demo.FinancialServices.002",
        };
      });
    });
    ipcMain.handle(IPC.getAccountState, (_event, id) => ({
      runs: [{ runId: "demo-run", at: "2026-11-11T08:00:00.000Z", durationMs: 1, ok: true, baseline: false }],
      reviewedThrough: null,
      since: {
        added: [{ id: `change-${id}`, name: "Demo migration", accountName: "Test account", ownerName: "Demo Owner", date: "2027-01-15", status: "On Track" }],
        modified: [], disappeared: [], churn: [], runCount: 1, fromRunId: null, toRunId: "demo-run",
      },
      milestones: milestoneService.getMilestones([id]).milestones,
    }));
    ipcMain.handle(IPC.resetSetup, async () => {
      await aiService.reset();
      resetCalls++;
      signedIn = false;
      configured = false;
      privacyAccepted = false;
      savedSettings = defaultSettings();
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
    await checkAllChangesSpacing();
    await clickMetric("Accounts");
    await wait(() => js("document.querySelector('.metric-drilldown h2')?.textContent === 'Portfolio accounts'"));
    assert.equal(await js("document.querySelectorAll('.metric-drilldown tbody tr').length"), 3);
    await click("Close");
    await checkOwnerScrolling();
    await clickMetric("On track");
    await wait(() => js("Boolean(document.querySelector('.milestone-table-wrap'))"));
    assert.equal(await js(`[...document.querySelectorAll('.milestone-facet')].find(field => field.querySelector('label').textContent === 'Status').querySelector('input').value === 'On Track'`), true,
      "Grouped status metric retains its milestone filter");
    await click("Close");
    await clickMetric("Stale accounts");
    await wait(() => js("document.querySelector('.metric-drilldown h2')?.textContent === 'Stale accounts'"));
    assert.equal(await js("document.querySelectorAll('.metric-drilldown tbody tr').length"), 1,
      "Grouped freshness metric preserves its account filtering");
    await click("Close");
    await checkWorkspaceFeatures();
    window.webContents.debugger.attach("1.3");
    await checkMilestoneWorkspace();
    await checkCollapsedSidebar();
    await checkSettingsLayout();
    const theme = await js("document.documentElement.dataset.theme");
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT.replace(/\.png$/i, `-${theme}.png`));
    }
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.appearance-settings input'))"));
    await js(`document.querySelector('.appearance-settings input[value="${theme === "light" ? "dark" : "light"}"]').click()`);
    await wait(() => js(`document.documentElement.dataset.theme !== ${JSON.stringify(theme)}`));
    await click("Portfolio");
    await wait(() => js("Boolean(document.querySelector('.portfolio-summary-grid'))"));
    await checkPortfolioCards();
    await checkOwnerScrolling();
    await checkAllChangesSpacing();
    await checkMilestoneWorkspace();
    await checkCollapsedSidebar();
    await checkSettingsLayout();
    window.webContents.debugger.detach();
    if (process.env.MCAPS_SMOKE_SCREENSHOT) {
      await screenshot(process.env.MCAPS_SMOKE_SCREENSHOT);
    }
    await click("Settings");
    await wait(() => js("Boolean(document.querySelector('.updates-panel'))"));
    await wait(() => js("document.querySelector('.settings-profile').innerText.includes('Demo role')"));
    await checkAiConnections();
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
    assert.equal(await js("document.querySelector('.sidebar button[aria-label=\"Team\"]') === null"), true, "Reset restores Team off");
    assert.equal(await js("Boolean(document.querySelector('.sidebar button[aria-label=\"PODs\"]'))"), true, "Reset restores PODs on");
    assert.equal(territoryRefreshes, 1, "Legacy territory metadata is loaded once and reused across workspace navigation");
    console.log("MCAPS UI smoke passed: milestones workspace, real local XLSX exports, grouping, resizing and frozen columns; persistent Team/POD switches and collapsed navigation at three widths in both themes; existing AI/Work IQ, Settings layout, portfolio, changes, scrolling, onboarding, reset and updates.");
    milestoneStore.close();
    window.destroy();
    app.exit(0);
  }).catch((error) => {
    console.error(error);
    if (window && !window.isDestroyed()) window.destroy();
    milestoneStore?.close();
    app.exit(1);
  });
}
