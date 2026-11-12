# MCAPS Console

Local-first Windows desktop application for tracking an authorized manager's MSX customer portfolio, milestone changes, team roster, and POD coverage.

## Interface and setup

The workspace uses Microsoft **Fluent UI React v9** components, Fluent icons, and light/dark themes, with Settings and the signed-in profile anchored at the bottom of the navigation rail. It is an independent productivity tool, not an official Microsoft product.

Fluent packages are build-time dependencies: Vite bundles the required renderer code/icons into the app, avoiding shipping the entire component/icon source trees in the Electron runtime.

**Settings > Team and PODs** controls optional workspace pages: Team is off by default and PODs is on. These device-local choices persist across restarts, including when upgrading an existing installation. Hiding a page keeps its saved roster/POD records. Use **Minimize sidebar** to switch to an icon-only rail and **Expand sidebar** to restore labels; this layout preference is remembered alongside the theme.

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

### Appearance and optional AI connections

Theme controls are in **Settings > Appearance**, not beside the navigation link.

**Settings > AI / LLM access > Test AI access** saves the optional runtime/model
configuration and sends a real synthetic prompt through the official GitHub
Copilot SDK. The default is a bundled compatible runtime using the official
client's existing login. A custom trusted `.exe` path and permitted model ID are
optional. If authentication is missing, sign in with the official Copilot CLI
and retry. No API key, new Entra app registration, Graph scope, or change to MSX
sign-in is introduced.

A successful LLM response enables **Work IQ access**. Its test launches the
existing official **local** Work IQ MCP installation and sends a fixed synthetic
question, rather than treating a local handshake as proof of service access.
Leave the path blank to detect an existing npm/Windows installation, or select
its trusted executable, npm shim, or official `bin\workiq.js`. The test uses that
client's own Microsoft identity, consent and billing. It does not install Work
IQ, accept its license, retrieve workplace content, or verify organizational
search permissions. Remote-only MCP/Cowork browser sessions are not connected by
this initial integration; no tokens are copied from other applications.

Both buttons make actual service calls and may consume provider allowances.
Only fixed synthetic content is sent; no account, profile, or milestone data is
included. Tests can be stopped and time out with retry guidance. Configuration
is encrypted in the app vault; success is session-only and must be retested after
restart. Retesting/changing AI settings invalidates the dependent Work IQ state.
Reset clears app-owned AI configuration/results, not the official clients'
global logins. Runtime-owned synthetic diagnostics may follow those clients'
retention policies.

### Milestone exploration and Excel export

**Milestones**, between Portfolio and All Changes, reads the latest saved
captures across active tracked customers. **Reload saved data** rereads the
vault; use Portfolio's Fetch actions for fresh MSX data. The page reports
customers without captures and keeps portfolio parents distinct from the
actual MSX account on each milestone.

The same exploration controls are used in account milestone tabs and
account/portfolio metric drill-downs: text/comment search, searchable multi-value
facets (including missing values), inclusive date and signed monthly-use bounds,
up to three grouping levels, sorting, group expand/collapse, and pagination.
Selecting multiple values within one facet means OR; separate constraints mean
AND. Monthly amounts remain in source units, without currency conversion.

**Raised By** is the MSX record's **Created By**, not its current owner or an
inferred human requester. It supports search, filtering, grouping, ordering,
column preferences, details and Excel export, including the source creator ID.
Older captures need a normal **Portfolio > Fetch** to populate creator details;
Reload saved data cannot reconstruct missing fields. Missing creators stay
unknown. Raised-by organization classification is deferred; no directory calls
or new permissions are introduced.

Drag any data-column divider to resize it, or focus the divider and use
Left/Right, Shift+Left/Right, or Home. **Freeze column** moves the selected
column first and keeps it visible during horizontal scrolling; Milestone is
frozen initially. **Columns** shows/hides data columns and the Links & details
column, with at least one column remaining visible. Widths, visibility and
freezing are remembered locally across views and app restarts; search, filters,
grouping and sorting are not saved. Hidden columns retain their widths and freeze
preference; freezing a hidden column makes it visible. **Reset columns**
restores all columns and defaults; narrow views temporarily limit frozen width to leave room
for the other columns.

Every milestone grid has **Export Excel**. It saves a genuine `.xlsx` under
Windows' configured Downloads folder and asks File Explorer to select it.
The file includes all filtered milestones in fully expanded group/sort order,
not just the current page; collapsed groups do not remove export rows.
The workbook contains typed dates/numbers, filterable headers, frozen panes,
source IDs/comments/URLs, and a View sheet recording the applied filters/scope.
Exports are limited to 50,000 rows and Excel's cell length limit, never silently
truncated. If saved data changes during export preparation, reload the view and
retry. The workbook is **unencrypted business data outside the vault**.
Folder-opening failures are reported separately from successful file saves.

Milestone cells show the MSX account and workload below the name. Names and
other text columns wrap to at most two lines; account/workload sublines use one
line each. Overflow is ellipsized without losing the full tooltip/details data.
The sublines show only values: the account is semibold blue, and the workload
is italic purple with theme-aware contrast. Tooltips retain the field labels.
The last grid column has labeled **Milestone** and **Opportunity** links that
open in the default browser, and **View** for local details. Right-click either
link (or focus it and press Shift+F10) for **Copy to clipboard**. Missing links
are unavailable; clipboard and browser-opening failures are shown explicitly.

## Fetch progress, changes, and history

Account dashboards group delivery/commitment counts into one card, alongside a
compact account overview; every metric still opens its underlying milestones.
Change cards show status, commitment, source-formatted monthly use, owner, date
and creator, with labeled before/after values, edit counts and numeric deltas.
Long comments expand in place. Disappeared records retain the live MSX reason
and old/current differences; an inaccessible record is not called deleted.
Search and type/owner/field filters update the accompanying insight counts.

**Fetch all** and **Fetch now** open a right-anchored progress panel showing the
active account, real milestone/page counts, encrypted save stages and per-account
failures. Only the currently fetched account has a horizontal activity bar;
unknown network totals remain indeterminate rather than showing invented
percentages. Closing the panel does not cancel fetching. The progress button
reopens it, and progress/busy state survives navigation and renderer reload.

**Account > History** includes successful captures and failed attempts. Inspect
a successful fetch using **Oldest / Previous / Next / Latest**. Its read-only
drawer shows that fetch's changes, original scope, full captured milestone grid,
details and filtered Excel export from the historical snapshot, not today's
records. The workbook identifies the source run. Baselines are explicitly not
change events. **All Changes > History timeline** browses UTC days with recorded
events, including reviewed changes, with account/owner/type/field/text filters
and links into the same fetch explorer.

All new snapshots, changes and run records are retained in the encrypted vault,
without automatic pruning. The legacy retention setting migrates to keep-all.
Mark reviewed only advances the review watermark. History grows with use;
older snapshots already pruned cannot be recovered, and the explorer explicitly
reports unavailable snapshots while preserving their change documents.

## Security model

- Uses the system browser for Microsoft authentication.
- Performs read-only MSX requests.
- Stores application data under the current Windows user's application-data directory.
- Encrypts every sensitive SQLite payload with AES-256-GCM.
- Protects the encryption key and MSAL cache with Windows DPAPI through Electron `safeStorage`.
- Runs the renderer with Node integration disabled, context isolation enabled, and a narrow typed preload API.
- Baseline MSX features do not require GitHub Copilot or a separately installed `msx-cli`; optional AI requires the user's authorized Copilot access.

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

After building, run `npm run test:updates:smoke` to exercise the actual Electron preload/renderer update UI with mocked release responses, workspace switches, and collapsed navigation. Set `MCAPS_UI_SMOKE_APP` to an unpacked build's `resources\app.asar` to check its packaged assets using synthetic fixtures. A real signed N-to-N+1 installation test is still required before publishing.

**Opt-in live AI validation:** after building, `npm run test:ai:live` exercises
both Settings test buttons with actual providers, a fresh isolated app vault,
and synthetic MSX fixtures. It uses existing official-client credentials and
may consume allowance; it is deliberately not part of `npm test`. Set
`MCAPS_AI_SMOKE_APP` to an unpacked build's `resources\app.asar` to validate the
packaged preload, renderer, SDK and native assets without opening real app data.
