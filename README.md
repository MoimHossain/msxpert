# MCAPS Console

Local-first Windows desktop application for tracking an authorized manager's MSX customer portfolio, milestone changes, team roster, and POD coverage.

## Interface and setup

The workspace uses Microsoft **Fluent UI React v9** components, Fluent icons, and light/dark themes, with Settings and the signed-in profile anchored at the bottom of the navigation rail. It is an independent productivity tool, not an official Microsoft product.

Fluent packages are build-time dependencies: Vite bundles the required renderer code/icons into the app, avoiding shipping the entire component/icon source trees in the Electron runtime.

**Settings > Reset setup** signs out, clears the profile/photo/token cache and territory selection, archives tracked customer registrations, and restores default setup preferences/privacy consent. Confirmation requires typing `RESET`. The same privacy, MSX sign-in, sales-territory, milestone-window, and import flow runs again. Customer data/history, encrypted database/key, team, and POD records are retained; re-adding a customer reconnects its previous identity and history. Reset refuses to run while application operations or an update restart are active.

### Connection and sign-in

`msx-connection.json` contains the bundled, non-secret connection defaults. Override it locally with a complete `connection.json` in the app data directory (`%LOCALAPPDATA%\CSU Console`):

- `tenant`: Entra tenant ID/domain, or `organizations`.
- `clientId`: public-client application ID.
- `resourceUrl`: HTTPS MSX/Dataverse origin, without an API path.
- `appId`: Dataverse model-driven application ID used in record links.

Restart the app after changing connection configuration. Never put tokens, passwords, or client secrets in these files. MSX sign-in uses the original `${resourceUrl}/.default` scope only, with public-client authorization-code/PKCE and a `http://localhost` loopback redirect. It never requests Graph consent as part of MSX sign-in.

MSAL opens the system browser; cancellation and a two-minute timeout release the pending flow so it can be retried. Later launches display the cached profile while silently validating the session. The main workspace remains gated until authentication and onboarding complete. Expired API tokens receive one forced silent refresh; an interaction-required response returns to sign-in rather than opening an unexpected background browser.

Profile details come exclusively from MSX: `WhoAmI` identifies the signed-in user, then `systemusers(<UserId>)` supplies `fullname`, `title`, `internalemailaddress` (with `domainname` fallback), and optional `entityimage`. These fields and the read-only request were verified against live MSX. Missing images use initials. Department and office location remain blank because no corresponding dedicated fields were verified; a business unit is not treated as a department.

Profile JSON and the photo are stored as separate AES-encrypted records/blobs in the existing local SQLite vault, not in the protected MSAL token-cache file. Cached profiles are matched to the signed-in account before display and refreshed in the background. **Settings > Refresh MSX profile** retries the same MSX-only requests, using existing expiry and throttling handling. Profile errors remain visible without discarding the previous complete cache. No Microsoft Graph calls, token requests, or consent flows are used. Neither tokens nor profile/customer data are logged.

### Territory onboarding and verification notes

The picker reads and pages `territories` under the signed-in user's delegated Dataverse permissions. **Access scope is Dataverse security trimming, not personal territory assignment.** A read-only live check confirmed the tested user had no direct `systemusers._territoryid_value` assignment, so an assignment-only filter would incorrectly hide usable territories. No organization/group names or territory names are hardcoded. Search spans names, `msp_salesgroupname`, `msp_salesunitname`, and `msp_accountteamunitgroupname`. At most 200 matching rows are rendered at once; search and "Show selected only" make the complete discovered list navigable.

Confirmed against live MSX: the grouping fields above, empty parent-territory lookups in representative records, and absence of territory `statecode`, `statuscode`, or a fiscal-year attribute. Historical `FYnn-...` names coexist with unversioned names. The app excludes explicit names for other fiscal years using the Microsoft July-June calendar and labels unversioned records and unavailable status explicitly. **Limitation:** an unversioned territory cannot independently be certified active from this schema; the app does not invent an inactive filter or infer a portfolio entity.

Also confirmed live: `accounts._territoryid_value`, the TPID attribute `msp_mstopparentid`, and `msp_parentinglevelcode = 861980000` for the top parent. The app pages territory accounts, resolves all accounts sharing each TPID, requires exactly one accessible top parent, and deduplicates by TPID across selected territories. It never falls back to tracking a selected child. Manual name/TPID lookup uses the same top-parent resolution; distinct TPIDs are not merged merely because their names match.

The read-only preview shows territory/top-parent/already-present counts and unresolved accounts before any account is added. Confirmed imports reuse the normal account-add/history-restoration logic, run sequentially under the operation gate, publish progress, and report failures explicitly. Re-previewing a partial import skips successful TPIDs. Previews are short-lived, account-bound, single-use, and invalidated by sign-out/reset. Setup does not finish when the first account lands; the user acknowledges the completed or partial import.

Live verification did not import customer data, reset a real profile, or change permissions. A full interactive login in the rebuilt application still requires validation in the target tenant; unit/renderer tests use synthetic data.

## Security model

- Uses the system browser for Microsoft authentication.
- Performs read-only MSX requests.
- Stores application data under the current Windows user's application-data directory.
- Encrypts every sensitive SQLite payload with AES-256-GCM.
- Protects the encryption key and MSAL cache with Windows DPAPI through Electron `safeStorage`.
- Runs the renderer with Node integration disabled, context isolation enabled, and a narrow typed preload API.
- Does not require GitHub Copilot or a separately installed `msx-cli`.

## Development

```powershell
npm install
npm run dev
```

## Validation

```powershell
npm test
npm run typecheck
npm run build
```

## Packaging

```powershell
npm run package
```

The generated installer is not production-ready until it is signed and timestamped with an approved publisher identity.

The Windows app is **`MCAPS Console.exe`** and the primary installer is **`MCAPS-Console-Setup-<version>.exe`**. The application ID, internal package/cache identity, and existing `%LOCALAPPDATA%\CSU Console` data directory are deliberately preserved so the rename does not strand previous installations' data.

Packaging also creates a byte-identical `CSU-Console-Setup-<version>.exe` update alias and points the channel manifest at it for compatibility with existing CSU alpha clients. Publish **both** installers and the generated manifest; new users download the MCAPS-named installer. Do not remove the legacy alias while older updater clients are supported. `npm run prepare:updates` prepares the alias after a custom build (or use `scripts\prepare-update-artifacts.ps1 -Directory <output-directory>`).

## Releases and updates

Download signed Windows x64 installers from [GitHub Releases](https://github.com/MoimHossain/msxpert/releases). No GitHub account is required.

Installed signed builds offer **Settings > Updates > Check for updates**, followed by **Update and restart**. The update is verified before installation, preserves local data, and waits for active work or unsaved edits before restarting. The same panel is available through **App updates** before MSX sign-in and setup. Development and unsigned builds cannot install updates.

**Temporary unsigned test releases:** explicitly marked numbered `alpha` packages also support updates, but only to newer alpha test releases. They display an **Unsigned test build** warning and verify checksums and embedded version, **not publisher identity**. They are not production releases. Install `alpha.1` to exercise updating to `alpha.2`. Switching to the future signed production channel requires installing a signed release manually.

For release infrastructure, publishing gates, and recovery instructions, see [Signing and releasing](prds/SIGNING.md). Existing installations without the updater need one manual upgrade to an updater-enabled release.

After building, run `npm run test:updates:smoke` to exercise the actual Electron preload/renderer update UI with mocked release responses. A real signed N-to-N+1 installation test is still required before publishing.
