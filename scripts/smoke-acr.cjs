const { join } = require("node:path");
const { homedir } = require("node:os");
const { existsSync, readFileSync, statSync } = require("node:fs");

if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = mode => {
    const result = spawnSync(require("electron"), [__filename, mode], {
      env, stdio: "inherit", timeout: 240000, windowsHide: true,
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
  };
  if (process.argv.includes("--connect")) {
    const connected = run("--connect");
    if (connected) process.exit(connected);
  }
  // Verification always runs in a new process, never the interactive client.
  process.exitCode = run("--verify");
} else {
  const { app, shell } = require("electron");
  const root = join(__dirname, "..");
  const { LEGACY_APP_NAME } = require(join(root, "dist-main", "shared", "branding.js"));
  app.setPath("userData", join(app.getPath("appData"), LEGACY_APP_NAME));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const { VaultStore } = require(join(root, "dist-main", "main", "storage", "vault.js"));
    const { AuthService } = require(join(root, "dist-main", "main", "auth.js"));
    const { PowerBiAuth } = require(join(root, "dist-main", "main", "powerbi-auth.js"));
    const { PortfolioService } = require(join(root, "dist-main", "main", "portfolio-service.js"));
    const { MsxClient } = require(join(root, "dist-main", "main", "msx-client.js"));
    const { acrWindow } = require(join(root, "dist-main", "domain", "acr.js"));
    const { ACCESS_COLUMNS, ACR_COLUMNS, ACCESS_MODEL_ID, ACR_MODEL_ID, PowerBiQueryClient,
      buildAccessQuery, buildServiceQuery, acrRows } = require(join(root, "dist-main", "main", "powerbi-query.js"));
    const directory = join(process.env.LOCALAPPDATA || app.getPath("userData"), LEGACY_APP_NAME);
    const msxAuth = new AuthService(directory);
    const employee = await msxAuth.getAccountIdentity();
    if (!employee) throw new Error("Sign in to MSX in the app before verifying Power BI.");
    const auth = new PowerBiAuth(directory);
    const signal = AbortSignal.timeout(210000);
    if (process.argv.includes("--connect")) {
      await auth.connect(employee, signal);
      console.log(JSON.stringify({ step: "explicit-interactive-connection", connected: true }));
      app.quit();
      return;
    }
    let browserCalls = 0;
    shell.openExternal = async () => { browserCalls++; throw new Error("Verification must never open a browser."); };
    const store = new VaultStore(directory);
    try {
      const portfolio = new PortfolioService(store, msxAuth, new MsxClient(msxAuth), app.getVersion());
      const configured = portfolio.listAccounts();
      const token = await auth.getToken(employee, signal);
      let httpQueries = 0;
      const query = new PowerBiQueryClient(async (...args) => { httpQueries++; return fetch(...args); });
      const access = await query.execute(token.token, ACCESS_MODEL_ID,
        buildAccessQuery(token.user.username.split("@")[0]), ACCESS_COLUMNS, signal);
      const allowed = new Set(access.map(row => String(row.tpid).trim()));
      const permitted = configured.filter(account => allowed.has(account.tpid));
      if (!permitted.length) throw new Error("No configured top-parent account is permitted by your live Power BI entitlement.");
      const referencePath = join(homedir(), ".csu-console", "acr-cache.json");
      let reference = null;
      if (existsSync(referencePath)) {
        if (statSync(referencePath).size > 128 * 1024 * 1024) throw new Error("The reference snapshot exceeds the comparison safety limit.");
        reference = JSON.parse(readFileSync(referencePath, "utf8"));
      }
      const referenceAccounts = Array.isArray(reference?.accounts) ? reference.accounts : [];
      const account = permitted.find(parent => referenceAccounts.some(entry => String(entry.account?.tpid) === parent.tpid)) || permitted[0];
      const referenceEntry = referenceAccounts.find(entry => String(entry.account?.tpid) === account.tpid);
      const context = acrWindow();
      const closed = context.months.filter(month => !month.provisional);
      const month = [...closed].reverse().find(candidate => referenceEntry &&
        Number.isFinite(referenceEntry.totals?.[candidate.key]) &&
        reference.months?.some(item => item.key === candidate.key && !item.provisional)) || closed.at(-1);
      let pages = 0;
      const result = await query.execute(token.token, ACR_MODEL_ID,
        buildServiceQuery(account.tpid, month.key.slice(0, 4), [month]), ACR_COLUMNS, signal,
        progress => { pages = progress.pages; });
      const rows = acrRows(result);
      if (rows.some(row => row.month !== month.key)) throw new Error("The live query returned an unexpected fiscal month.");
      const actual = rows.reduce((sum, row) => sum + row.acr, 0);
      const expected = referenceEntry?.totals?.[month.key];
      const comparison = Number.isFinite(expected) ? {
        referenceFetchedAt: reference.fetchedAt, referenceAccountFetchedAt: referenceEntry.fetchedAt,
        referenceUsd: expected, differenceUsd: actual - expected, equalWithinOneCent: Math.abs(actual - expected) < .01,
      } : { unavailable: true, reason: "No matching closed-month total exists in the local reference snapshot." };
      console.log(JSON.stringify({
        step: "fresh-process-silent-live-query", liveQuerySucceeded: true, browserCalls, httpQueries,
        employeeMatchedMsx: true, account: account.name, tpid: account.tpid, month: month.key,
        currency: "USD", actualUsd: actual, rows: rows.length, pages, fetchedAt: new Date().toISOString(), comparison,
      }, null, 2));
      if (comparison.unavailable) process.exitCode = 2;
    } finally { store.close(); }
    app.exit(process.exitCode || 0);
  }).catch(error => {
    console.error(error instanceof Error ? error.message : "Power BI verification failed.");
    app.exit(1);
  });
}
