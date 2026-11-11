# CSU Console Desktop - Product Requirements Document

| Field | Value |
| --- | --- |
| Status | Draft for product and engineering review |
| Version | 1.0 |
| Date | 24 August 2026 |
| Product | CSU Console Desktop |
| Target users | Microsoft CSA managers and equivalent portfolio managers with authorized MSX access |
| Initial platform | Windows 11 on Microsoft-managed devices |
| Distribution | Signed Windows installer through a private GitHub Release |
| Data model | Single-user, local-first, no hosted service |

> This app is inspired by the [GitHub Copilot Canvas extension](../.github/extensions/msx-portfolio/extension.mjs) built by the same author.

## 1. Executive summary

CSU Console Desktop will turn the existing `msx-portfolio` Copilot canvas into a portable Windows application that peer CSA managers can install and use with their own Microsoft identity, MSX permissions, customer portfolio, team roster, and POD structure.

The application will:

- Authenticate each manager interactively against MSX using the system browser and their existing Microsoft-managed device identity.
- Keep credentials, portfolio configuration, MSX records, snapshots, and change history on that manager's computer.
- Let a manager find and add customers by name instead of editing JSON or knowing a TPID.
- Resolve each selected customer to its top-parent TPID and prevent child-account duplication.
- Let a manager find and add team members from MSX, organize them into PODs, and assign account coverage through screens.
- Preserve the current portfolio dashboards, milestone filters, account and team views, fetch history, change detection, churn folding, review watermark, and disappearance classification.
- Perform no write operations against MSX in the first release.
- Require no GitHub Copilot installation or Copilot runtime.
- Be delivered as a signed Windows installer. The preferred signing service is Azure Artifact Signing, subject to organizational eligibility and approval.

The recommended implementation is a security-hardened Electron application that reuses the existing TypeScript/Node.js MSX client, ingest pipeline, diff engine, and web UI concepts. This is the lowest-risk path to a useful first release because the current product and `msx-cli` are already JavaScript/TypeScript applications. A native .NET rewrite remains a future option if WAM-native authentication or Microsoft Store/Intune distribution becomes more important than implementation reuse.

## 2. Background and evidence

### 2.1 Current product

The existing canvas is a local application hosted by GitHub Copilot:

- `.github/extensions/msx-portfolio/extension.mjs` starts an ephemeral HTTP server on `127.0.0.1`, serves the UI, exposes local JSON routes, and connects the experience to the Copilot canvas lifecycle.
- `.github/extensions/msx-portfolio/webapp.html` contains the current single-page interface for the hub, portfolio, account, milestone, changes, history, team, person, POD, and POD-detail views.
- `.github/extensions/msx-portfolio/lib/msx.mjs` loads the separately built `msx-cli` API and owns MSX-specific account, milestone, field-normalization, deep-link, and disappearance logic.
- `.github/extensions/msx-portfolio/lib/ingest.mjs` performs the fetch, normalize, diff, persist, and retention workflow.
- `.github/extensions/msx-portfolio/lib/diff.mjs` computes per-run differences and folds multiple runs into one net view since the manager last marked an account reviewed.
- `.github/extensions/msx-portfolio/lib/store.mjs` provides local current-state files, compressed snapshots, change documents, watermarks, run logs, atomic writes, locking, and retention.
- `.github/extensions/msx-portfolio/lib/people.mjs` and `lib/pods.mjs` parse local Markdown files for roster and POD configuration and correlate them with MSX milestone ownership.
- `.github/extensions/msx-portfolio/config.json` currently contains a machine-specific `msx-cli` path, a fixed date window, account TPIDs, watched fields, excluded statuses, and retention.
- `.github/copilot-instructions.md` contains essential account hierarchy and MSX schema knowledge that is not currently enforced by the UI.

The current implementation has strong reusable behavior, but onboarding and operation assume the developer's repository layout and hand-maintained files.

### 2.2 Current MSX dependency

[`moimhossain/msx-cli`](https://github.com/MoimHossain/msx-cli) is an MIT-licensed TypeScript/Node.js client for the Microsoft Sales Dynamics 365 Web API. It provides:

- Interactive Authorization Code + PKCE sign-in through the system browser.
- Silent token reuse through MSAL Node.
- MSX Web API read and write helpers.
- User search, milestone and opportunity APIs, metadata queries, and a generic OData query API.
- A local token cache under the current user's profile.

The canvas does not execute the command-line program. It dynamically imports the compiled `dist/api.js` module and calls `queryEntity`. That compiled sibling-repository dependency is the main packaging blocker.

The desktop product should incorporate a versioned, read-only subset of this API as an internal package instead of depending on a separately cloned repository. Its MIT license permits reuse, but the distributed product must include the license and third-party notices.

### 2.3 External platform guidance

- Microsoft recommends brokers for MSAL authentication and identifies Windows Web Account Manager as the Windows broker. System-browser Authorization Code + PKCE remains the practical compatible flow for the existing Node implementation. [MSAL.NET browser and broker guidance](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/using-web-browsers)
- Microsoft documents packaged, external-location, and unpackaged Windows deployment models. A signed EXE installer is suitable for direct GitHub Release distribution, while MSIX is more attractive for Store or managed enterprise distribution. [Windows app packaging overview](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/packaging/)
- Microsoft recommends Azure Artifact Signing, formerly Trusted Signing, for non-Store code signing when the publisher is eligible. [Windows code-signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options) and [Artifact Signing documentation](https://learn.microsoft.com/en-us/azure/trusted-signing/)
- Signing does not guarantee that a new application immediately avoids SmartScreen warnings. Reputation builds over time, while a consistent trusted publisher identity is still materially better than an unsigned or self-signed executable. [SmartScreen reputation guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)
- Windows Data Protection API can protect local secrets for the signed-in OS user. Electron exposes this through `safeStorage`. [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) and [Windows Data Protection API](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection)

## 3. Problem statement

The current canvas is useful to one manager but cannot be safely handed to peers because:

1. It only runs inside the GitHub Copilot extension host.
2. It depends on a separately cloned and built `msx-cli` at an absolute local path.
3. Its initial portfolio is hard-coded in `config.json`.
4. Correct account onboarding depends on instructions about top-parent and child accounts.
5. Team and POD setup requires hand-editing local Markdown files.
6. Its fixed milestone window requires periodic source edits.
7. Sensitive MSX data is stored as readable repository files.
8. It has no standalone installer, update channel, publisher signature, or release process.
9. Its localhost API trusts its host environment and is not hardened as an independently distributed application.

CSA managers need the same portfolio intelligence without sharing customer data, credentials, or one manager's configuration, and without requiring source-control or Node.js knowledge.

## 4. Product vision

> A manager installs one trusted Windows application, signs in with their Microsoft identity, selects their customers and team, and immediately receives a private, continuously comparable view of portfolio health and change.

## 5. Product principles

1. **Local by default** - no application data or MSX token is sent to a product-owned cloud service.
2. **Act as the signed-in manager** - every MSX read uses the current manager's identity and existing authorization.
3. **Read-only first** - the app must not create or edit MSX records in version 1.
4. **Hierarchy-safe onboarding** - a manager selects customers; the app resolves and enforces the top parent.
5. **No shipped customer configuration** - production packages contain no customer, team, POD, snapshot, or token data.
6. **Explain absence accurately** - leaving a result set is not automatically a deletion.
7. **One source of truth for change counts** - portfolio, account, and review views use the same folded-change calculation.
8. **Secure failure** - authentication, storage, update, and data-integrity failures must be explicit and must not become success-shaped empty states.
9. **Recoverable local state** - managers can back up, export, restore, or reset their own configuration and history.
10. **Low operational burden** - installation and updates should not require Node.js, Git, command-line tools, or administrator access unless enterprise policy requires them.

## 6. Goals and non-goals

### 6.1 Goals for version 1

- A new manager reaches a populated portfolio without editing files.
- Every manager signs into MSX using their own account.
- Account search returns sufficient identity and hierarchy information to make a safe selection.
- Duplicate TPIDs and child accounts cannot produce duplicate portfolio data.
- Team members can be discovered and added through a UI.
- PODs and account coverage can be configured through a UI.
- Existing milestone, dashboard, change, history, and review behaviors are retained.
- All app data is stored locally and protected for the current Windows user.
- A signed installer can be published as a GitHub Release.
- Release artifacts are reproducible, checksummed, and verifiably signed.

### 6.2 Explicit non-goals for version 1

- No hosted multi-tenant web application or shared backend.
- No synchronization of portfolio data between managers.
- No write-back to MSX.
- No GitHub Copilot dependency.
- No AI-based "Explain changes" handoff.
- No automatic assignment of people to PODs without manager confirmation.
- No support for non-Microsoft Dynamics environments.
- No macOS or Linux support.
- No mobile application.
- No generalized CRM query builder.

## 7. Personas

### 7.1 Portfolio manager

Owns a set of customer accounts and a team or group of teams. Needs a fast portfolio health view, change awareness, and coverage diagnostics. Has valid MSX access but may not know TPIDs, account hierarchy, OData fields, or developer tools.

### 7.2 Team lead or delegate

Reviews a subset of accounts or a POD. Needs team member and ownership views but may not administer application configuration.

For version 1, both personas use the same local Windows profile. In-app role-based access is not required because MSX authorization and Windows account access are the security boundaries.

### 7.3 Product maintainer

Builds, signs, publishes, and supports the desktop application. Needs release diagnostics without receiving customer records or tokens.

## 8. Scope summary

| Area | Current behavior | Desktop requirement |
| --- | --- | --- |
| Authentication | External `msx-cli` token cache | Built-in interactive sign-in, silent reuse, sign-out, account status |
| Accounts | Hand-edited JSON with TPID | Search by customer name, hierarchy preview, top-parent enforcement |
| Date window | Fixed JSON dates | Setup default plus editable named windows |
| Portfolio | Account cards and KPIs | Preserve and add stale-data/configuration states |
| Milestones | Filterable/sortable local table | Preserve, with robust pagination and export |
| Changes | Per-run and folded changes | Preserve exactly, including churn |
| Disappearances | Live re-query and classification | Preserve exactly |
| Review | Per-account watermark | Preserve; add portfolio review workflow |
| History | Run list and drill-down | Preserve |
| Team | Markdown profiles | Search MSX users and manage local roster |
| PODs | Markdown mapping | UI-managed PODs, roles, accounts, and people |
| Storage | Repository JSON/gzip files | Encrypted per-user application data |
| Hosting | Copilot canvas localhost server | Packaged desktop process with isolated renderer/backend |
| Distribution | Source checkout | Signed installer through private GitHub Release |
| Copilot explanation | Enqueued chat prompt | Excluded from version 1 |

## 9. User journeys

### 9.1 First launch

1. Manager starts the application.
2. App shows a privacy statement: MSX data stays on this device; the app is read-only; no product telemetry is enabled by default.
3. Manager selects **Sign in to MSX**.
4. The system browser completes organizational authentication and Conditional Access.
5. App verifies the identity using `WhoAmI` and displays the signed-in name and account.
6. Manager configures a milestone window. The default is the current Microsoft fiscal year, with a suggested near-term operational window.
7. Manager proceeds to customer setup.

Success condition: the application records no customer data before authentication succeeds, and no credential is entered into an application-owned form.

### 9.2 Add a customer

1. Manager enters at least three characters of a customer name.
2. App searches authorized MSX account records and shows name, country, parenting level, MS Sales account identifier, top-parent name, and TPID where available.
3. Manager selects a result.
4. App resolves the complete top-parent record and account tree.
5. If the selected record is a child, the app explains that tracking it separately would duplicate milestones and proposes the top parent.
6. App rejects a selection whose TPID is already tracked.
7. App previews the number of account records and milestones in the configured window.
8. Manager confirms **Add top parent**.
9. App performs the baseline fetch and marks it as a baseline, not as newly added milestones.

Success condition: one unique TPID exists at most once in the portfolio, regardless of which child record the manager initially searched for.

### 9.3 Add team members

1. Manager searches by employee name or email.
2. App queries authorized MSX `systemusers` records.
3. Results show display name, email/UPN, title, active state, and MSX user identifier.
4. Manager adds one or more people to the local roster.
5. App matches milestones by immutable owner ID whenever possible.
6. App displays unmatched owners and allows the manager to link an unmatched identity to a roster person.

Success condition: display-name changes do not break established joins because owner ID is the primary key.

### 9.4 Create a POD

1. Manager creates a POD with a unique name.
2. Manager selects tracked accounts.
3. Manager assigns people to named roles such as CSAM, Durable CSA, and CAIP CSA.
4. Manager may add a coverage percentage or free-text note.
5. App warns about accounts in no POD, accounts assigned to multiple PODs, roster people not used in any POD, and milestone owners outside the configured team.
6. Manager saves the POD.

Success condition: no reference is silently dropped when an account or person is removed or becomes unavailable.

### 9.5 Refresh and review

1. Manager selects **Fetch all** or refreshes one account.
2. App displays progress by account and allows cancellation between accounts.
3. App records a successful or failed run for each account independently.
4. The first successful run is a baseline.
5. Later runs display added, modified, no-longer-in-scope, and churn records.
6. Manager reviews an account and selects **Mark reviewed**.
7. Future change views fold changes after that watermark.

Success condition: one account failure does not discard successful results for other accounts, and counts remain consistent across all views.

## 10. Functional requirements

### 10.1 Authentication and session

**AUTH-01 - Interactive sign-in**  
The app shall use MSAL Authorization Code + PKCE through the system browser. It shall not embed a username/password form or use ROPC.

**AUTH-02 - Conditional Access**  
The sign-in flow shall support Microsoft-managed Windows device compliance and browser-based PRT behavior equivalent to the current `msx-cli` flow.

**AUTH-03 - Silent reuse**  
After initial sign-in, the app shall attempt silent token acquisition before opening an interactive browser.

**AUTH-04 - Identity verification**  
The app shall call `WhoAmI` after authentication and show the resolved signed-in identity.

**AUTH-05 - Sign out**  
Sign-out shall clear the application's token cache and in-memory tokens. Local portfolio data shall remain unless the manager separately chooses **Delete local data**.

**AUTH-06 - Access failures**  
The app shall distinguish expired authentication, Conditional Access failure, missing MSX privilege, network failure, and MSX service failure.

**AUTH-07 - No bearer-token logging**  
Tokens, authorization headers, cookies, and raw MSAL cache contents shall never be logged.

### 10.2 Portfolio onboarding

**ACCT-01 - Search**  
The app shall search MSX accounts by name with debouncing, explicit cancellation, escaped OData literals, bounded results, and paging.

**ACCT-02 - Result context**  
Each result shall show enough information to distinguish similarly named records: name, country, parent level, account identifier, top parent, and TPID.

**ACCT-03 - Top-parent resolution**  
Before adding an account, the app shall resolve the selected record to its top-parent TPID and query the complete tree using `msp_mstopparentid`.

**ACCT-04 - Child protection**  
The app shall never add a child as a second tracked portfolio root. The confirmation action shall add the resolved top parent.

**ACCT-05 - Duplicate protection**  
TPID shall be the uniqueness key for tracked portfolio roots. A duplicate TPID shall be rejected with a link to the existing entry.

**ACCT-06 - Preview**  
The app shall preview tree size and in-window milestone count before confirmation.

**ACCT-07 - Baseline**  
The first successful fetch shall create a baseline with zero reported changes.

**ACCT-08 - Remove**  
Removing an account shall require confirmation and provide separate choices:

- Remove from portfolio but retain history.
- Remove and delete all local account data.

Deletion shall never affect MSX.

**ACCT-09 - Reconfigure**  
Managers shall be able to rename the local display label without changing the resolved TPID.

**ACCT-10 - Portfolio import/export**  
The app shall export and import configuration without tokens, snapshots, or customer records. Imports shall be validated and duplicate TPIDs rejected.

### 10.3 Milestone scope and fetch

**FETCH-01 - Configurable window**  
The app shall support a named inclusive date range. The default shall be computed at runtime, not compiled as FY27 dates.

**FETCH-02 - Status filters**  
Default excluded terminal statuses shall match the current behavior: Completed, Cancelled, and Lost to Competitor. Status values shall be validated against MSX metadata where feasible rather than relying only on compiled numeric values.

**FETCH-03 - Read-only query**  
The production data-access module shall expose only GET/read operations required by the app. MSX PATCH and POST helpers shall not be callable from the renderer.

**FETCH-04 - Tree batching**  
Account GUID filters shall be batched to avoid Dataverse URL-length limits. The initial batch size may remain 25 and must be configurable internally.

**FETCH-05 - Pagination**  
The fetch layer shall follow Dataverse continuation links and shall not assume `$top=5000` returns the complete data set.

**FETCH-06 - No fragile milestone `$select`**  
The milestone query shall preserve the current known-safe behavior unless schema validation proves a selected field set is valid.

**FETCH-07 - Per-account isolation**  
Fetch, lock, run, and error state shall be isolated by tracked account.

**FETCH-08 - Fetch all resilience**  
A failed account shall not prevent later accounts from running. The final summary shall report successes and failures separately.

**FETCH-09 - Cancellation**  
The manager may cancel before the next account begins. An in-progress HTTP request may finish, but partial data shall not replace the prior current state.

**FETCH-10 - Retry**  
Transient HTTP 429 and 5xx responses shall use bounded exponential backoff and honor `Retry-After`.

**FETCH-11 - Atomic commit**  
The application shall commit a new current state only after the account tree, milestones, manifest, diff, and disappearance resolution are complete enough to form a consistent run.

### 10.4 Normalized milestone model

The normalized record shall retain at least:

- Milestone ID, number, name, date.
- Status value and label, status reason.
- Commitment, category, workload, solution area.
- Help needed, Azure region, Azure capacity type.
- Monthly use, formatted monthly use, non-recurring months.
- Forecast comments and modified date, milestone comments.
- Owner ID and display name.
- Account ID and display name.
- Opportunity ID, name, and deep link.
- Created date, modified date, modifier.
- Dataverse version number.
- MSX milestone deep link.

Formatted-value companion fields shall continue to be read from `<field>@OData.Community.Display.V1.FormattedValue`.

### 10.5 Change detection

**CHG-01 - Version gate**  
Records with unchanged Dataverse `versionnumber` shall bypass field comparison.

**CHG-02 - Watched fields**  
The app shall compare the current watched fields and make the list versioned as part of the application schema.

**CHG-03 - Per-run diff**  
Each non-baseline run shall store added, modified, and disappeared records with before/after watched-field values.

**CHG-04 - Unwatched edits**  
If `versionnumber` changed but no watched field changed, the run shall retain an `unwatchedOnly` event.

**CHG-05 - Disappearance terminology**  
The product shall never label an absent result as deleted without evidence.

**CHG-06 - Live classification**  
Disappeared records shall be queried by GUID without the date/status filter and classified as:

- Re-dated.
- Closed.
- Moved to another account tree.
- Unavailable or removed.
- Still matching or transiently out of scope.

**CHG-07 - Net folding**  
Changes since the review watermark shall fold A-to-B-to-C into A-to-C.

**CHG-08 - Churn**  
A-to-B-to-A shall be reported as churn, not as two outstanding modifications.

**CHG-09 - Count consistency**  
Portfolio totals, account badges, account Changes tabs, and review queues shall call one shared folding implementation.

**CHG-10 - Historical reproducibility**  
Each run shall retain its exact date window, excluded statuses, application schema version, watched-field version, and previous run identifier.

### 10.6 Review workflow

**REV-01 - Watermark**  
Marking an account reviewed shall persist the latest completed run ID and timestamp.

**REV-02 - Per-account operation**  
Reviewing one account shall not clear another account.

**REV-03 - Portfolio queue**  
The portfolio Changes page shall group only accounts with outstanding change or churn, with quiet accounts summarized separately.

**REV-04 - Safety**  
Mark reviewed shall be disabled when no completed run exists.

### 10.7 Portfolio and account UI

**UI-01 - Hub**  
The hub shall provide Portfolio, Team, PODs, and Settings entry points.

**UI-02 - Portfolio KPIs**  
Show accounts, milestones, at-risk, blocked, committed, monthly use, owners, stale accounts, failed refreshes, and unreviewed changes.

**UI-03 - Account cards**  
Show top-parent name, TPID, tree size, milestone count, status mix, owners, last successful fetch, and outstanding changes.

**UI-04 - Account dashboard**  
Preserve breakdowns by status, owner, month, solution area, child account, and Azure region.

**UI-05 - Milestone table**  
Preserve search, sorting, and filters for status, owner, account, commitment, month, and solution area.

**UI-06 - Deep links**  
Milestone, opportunity, and account links shall open in the system browser only after host validation against the configured MSX origin.

**UI-07 - Empty-state distinction**  
The UI shall distinguish not configured, never fetched, no matching data, authentication failed, access denied, and fetch failed.

**UI-08 - Accessibility**  
All workflows shall be keyboard accessible, expose meaningful names, meet WCAG 2.2 AA contrast targets, and not communicate status through color alone.

### 10.8 Team roster

**TEAM-01 - User search**  
Search MSX users by name or email using the existing `systemusers` API capability.

**TEAM-02 - Stable identity**  
Store MSX user ID as the primary roster identity. Store display name and email as mutable attributes.

**TEAM-03 - Aliases**  
Allow multiple owner identities to be linked to one roster person, preserving the current alias concept.

**TEAM-04 - Ownership join**  
Join by owner ID first, then explicit alias ID, then an exact display-name fallback only for migrated data.

**TEAM-05 - Unmatched owners**  
Show owners present in milestones but absent from the roster and allow one-click roster addition or linking.

**TEAM-06 - Manual person**  
Allow a local-only person to be added when no MSX user record exists. Mark that person as local-only.

**TEAM-07 - Local metadata**  
Permit optional title, role, manager label, level, notes, and coverage metadata without writing those values to MSX.

**TEAM-08 - Privacy**  
Team data shall not be included in logs, crash reports, release artifacts, or configuration exports unless explicitly selected.

### 10.9 POD and coverage management

**POD-01 - CRUD**  
Managers shall create, rename, and remove PODs in the application.

**POD-02 - Account membership**  
Tracked accounts shall be assignable to one or more PODs, with a warning for multiple assignments.

**POD-03 - Person roles**  
PODs shall support CSAM, Durable CSA, and CAIP CSA roles in version 1. The storage model shall permit additional role types later.

**POD-04 - Qualifiers**  
An assignment may carry percentage, start/end dates, and notes.

**POD-05 - Diagnostics**  
Show uncovered accounts, duplicated coverage, unresolved people, roster people with no assignment, and actual milestone owners not represented in the POD.

**POD-06 - POD dashboard**  
Preserve per-POD account, milestone, status, owner, and monthly-use rollups.

### 10.10 Local data management

**DATA-01 - Location**  
Application data shall live under the current user's `%LOCALAPPDATA%` application directory, never beside the installed executable.

**DATA-02 - Encryption**  
Tokens and the local database encryption key shall be protected with Windows DPAPI through Electron `safeStorage`. Portfolio records and history shall be encrypted at rest.

**DATA-03 - Database**  
Use SQLite with an encrypted database implementation, or an equivalent design in which all sensitive record payloads are encrypted with AES-256-GCM and the data key is DPAPI-protected. The implementation spike must prove packaging, recovery, and performance before final selection.

**DATA-04 - Single instance**  
Only one application instance may write to a profile database at a time.

**DATA-05 - Transactions**  
Baseline, snapshot, diff, manifest, and run status writes shall use one transaction or an equivalent atomic commit boundary.

**DATA-06 - Retention**  
Default retention shall keep the most recent 60 snapshots plus the first successful snapshot of each calendar month.

**DATA-07 - Backup**  
The manager may create an encrypted backup containing configuration and optionally history. Tokens shall never be included.

**DATA-08 - Restore**  
Restore shall validate product version, database schema, integrity, duplicate TPIDs, and backup password before replacing current state.

**DATA-09 - Delete local data**  
The app shall provide an explicit destructive flow to erase tokens, configuration, snapshots, history, and logs from the current profile.

**DATA-10 - Schema migrations**  
Database migrations shall be versioned, transactional, reversible when practical, and covered by fixture-based tests.

### 10.11 Settings and diagnostics

Settings shall include:

- Signed-in identity and sign-out.
- Portfolio accounts.
- Milestone window and excluded statuses.
- Team roster and aliases.
- POD configuration.
- Snapshot retention.
- Data location, size, backup, restore, and reset.
- Application version, update status, signature/publisher information, licenses, and privacy notice.
- Diagnostic bundle export.

Diagnostic bundles shall:

- Require explicit manager action.
- Exclude tokens, authorization headers, milestone comments, forecast comments, customer record payloads, and team email addresses.
- Include application version, OS version, anonymized error codes, run timing, account count, record counts, migration status, and recent sanitized logs.
- Show a preview before saving.

## 11. Information architecture

```text
CSU Console
|- Portfolio
|  |- Overview
|  |- All changes
|  |- Account
|     |- Dashboard
|     |- Milestones
|     |- Changes
|     |- History
|- Team
|  |- Roster
|  |- Person
|  |- Unmatched owners
|- PODs
|  |- Coverage overview
|  |- POD detail
|  |- Coverage diagnostics
|- Settings
   |- Identity
   |- Accounts
   |- Scope
   |- Team and PODs
   |- Data and backup
   |- Updates
   |- Diagnostics and about
```

First launch uses a wizard. After setup, configuration remains editable in Settings without forcing the wizard again.

## 12. Proposed technical architecture

### 12.1 Decision

Build version 1 as a Windows-first Electron application with:

- A privileged main process for authentication, MSX HTTP access, storage, ingest, updates, and external navigation.
- A sandboxed renderer for presentation only.
- A narrow, typed preload API for approved operations.
- Shared TypeScript domain packages for MSX normalization, diffing, ingestion, account hierarchy, team correlation, and POD logic.
- A local encrypted SQLite database.
- No persistent localhost HTTP listener.

### 12.2 Why Electron for version 1

- The existing MSX client is TypeScript/Node.js.
- The current UI is HTML, CSS, and JavaScript.
- The current ingest, diff, and storage behaviors are JavaScript modules.
- Existing behavior can be migrated and tested incrementally instead of rewritten all at once.
- Electron supports Windows installers, Authenticode signing, external-browser auth, DPAPI-backed `safeStorage`, and a strong process boundary when configured correctly.

Electron is not selected because it is inherently more secure than native .NET. It is selected because secure reuse produces a smaller correctness and delivery risk for the first portable release.

### 12.3 Required Electron hardening

- `nodeIntegration: false`.
- `contextIsolation: true`.
- Renderer sandbox enabled.
- No remote module.
- Strict Content Security Policy without inline script or `unsafe-eval`.
- Refactor the current inline HTML script and style into packaged static assets.
- Typed allow-listed IPC methods only.
- Validate every IPC request in the main process.
- Never expose generic filesystem, shell, HTTP, or OData-query methods to the renderer.
- Block unexpected navigation and new-window creation.
- Open only allow-listed HTTPS MSX links through the OS browser.
- Load only packaged local content.
- Disable or remove DevTools in production builds unless a support mode is explicitly enabled.
- Do not accept remote code, plugins, or arbitrary extensions.

### 12.4 Logical modules

```text
apps/desktop
|- main
|  |- lifecycle
|  |- auth
|  |- ipc
|  |- navigation
|  |- update
|- preload
|- renderer
packages
|- msx-client-readonly
|- portfolio-domain
|- ingest
|- diff
|- storage
|- team
|- pods
|- shared-contracts
```

This is a proposed structure for the new app, not a requirement to reorganize the existing canvas files.

### 12.5 MSX client integration

Extract or vendor a pinned, read-only subset of `msx-cli`:

- Authentication and token acquisition.
- `WhoAmI`.
- Generic internal HTTP primitive restricted to approved app services.
- Account search and tree resolution.
- System-user search.
- Milestone reads and disappearance lookups.
- Metadata reads needed to resolve labels and validate status values.

Do not bundle CLI command parsing, terminal formatting, earnings commands, or MSX mutation methods. Preserve the MIT license and record the exact upstream commit used.

### 12.6 .NET alternative

A WPF or WinUI 3 application with MSAL.NET and WAM is the strongest Windows-native alternative. It offers first-class broker authentication, native packaging, and direct Windows security APIs. It is not the version 1 recommendation because it would require rewriting the MSX client, ingest pipeline, diff engine integration, persistence layer, and UI. Reassess .NET if:

- Organizational security requires WAM rather than system-browser MSAL Node.
- Intune or Microsoft Store distribution becomes mandatory.
- Electron is disallowed by endpoint policy.
- A longer-lived product team is funded for a native rewrite.

## 13. Data model

Minimum logical entities:

| Entity | Key fields |
| --- | --- |
| AppProfile | schema version, created, updated, privacy choice |
| Identity | tenant/account identifiers, display metadata, last authentication |
| PortfolioAccount | local ID, TPID, top-parent MSX ID/name, country, active state |
| AccountTreeNode | MSX account ID, portfolio account ID, name, level, country |
| Scope | name, date from/to, excluded status values and labels |
| TeamPerson | local ID, primary MSX user ID, display name, email, metadata |
| PersonAlias | person ID, MSX owner ID/name |
| Pod | local ID, name, notes |
| PodAccount | POD ID, portfolio account ID, dates, percentage, notes |
| PodPersonRole | POD ID, person ID, role, dates, percentage, notes |
| MilestoneCurrent | portfolio account ID, milestone ID, normalized payload, version |
| Snapshot | run ID, portfolio account ID, created, encrypted/compressed payload |
| ChangeRun | run ID, previous run, baseline, manifest, counts, status, duration |
| ChangeRecord | run ID, milestone ID, kind, normalized summary, disappearance cause |
| FieldChange | change record ID, field, before, after |
| ReviewWatermark | portfolio account ID, reviewed run ID, reviewed date |
| FetchLock | portfolio account ID, owner process, acquired, expiry |

TPID is unique among active and archived `PortfolioAccount` records unless the manager explicitly purges or restores one.

## 14. Security, privacy, and compliance requirements

### 14.1 Threat model

Protect against:

- Another local user reading cached MSX data.
- Token theft from predictable plaintext files.
- A compromised renderer invoking arbitrary Node or filesystem operations.
- Malicious content in MSX comments becoming executable HTML or script.
- OData injection through customer or user search.
- Untrusted external navigation.
- Tampered installers or updates.
- Sensitive data entering logs, crash reports, release artifacts, or support bundles.
- Partial writes corrupting history.
- A child account being added twice and double-counting milestones.

The application cannot protect a manager's data from malware already running with that same Windows user's privileges. This limitation must be documented.

### 14.2 Data classification

Treat the following as sensitive:

- Access and refresh tokens.
- Customer names, identifiers, hierarchy, and account relationships.
- Milestone details, comments, financial/usage values, owners, and opportunity links.
- Employee names, email addresses, titles, levels, and team assignments.
- Snapshots and change history.

### 14.3 Controls

- Authenticate only through Microsoft identity endpoints and the system browser.
- Encrypt token cache and data keys with DPAPI.
- Encrypt sensitive local records at rest.
- Use TLS for all MSX and update traffic.
- Enforce renderer isolation and output encoding.
- Escape OData string literals and use constrained query builders.
- Apply least privilege internally by exposing read methods only.
- Sign every production executable, DLL, installer, and update artifact.
- Verify update signatures before installation.
- Generate a software bill of materials and third-party notices.
- Run dependency, secret, and malware scanning in the release pipeline.
- Default telemetry to off. Version 1 shall have no customer-data telemetry.

### 14.4 Privacy statement

The application must plainly state:

- Which data is read.
- Where it is stored.
- That MSX authorization controls what can be accessed.
- That the app does not modify MSX in version 1.
- That no portfolio data is uploaded to an application-owned service.
- How to export or delete local data.

## 15. Non-functional requirements

### 15.1 Performance

- Cold launch to usable shell: target under 3 seconds on a standard managed Windows 11 device.
- Local overview render after unlock: target under 1 second for 50 accounts and 10,000 current milestones.
- Local search/filter response: target under 150 ms.
- Account search first results: target under 2 seconds excluding authentication.
- Fetch progress must update at least once per completed account.

### 15.2 Scale

Version 1 shall support:

- 100 tracked top-parent accounts.
- 1,000 account-tree nodes per top parent.
- 25,000 current milestones across a portfolio.
- 250 roster people.
- 100 PODs.
- Five years of monthly anchor snapshots plus 60 recent snapshots per account.

### 15.3 Reliability

- No prior current state is lost when a fetch fails.
- A crash during fetch leaves the prior committed state readable.
- Database integrity is checked after abnormal shutdown.
- The app records failed runs without turning them into snapshots.
- All dates are stored as UTC timestamps or ISO calendar dates as appropriate.

### 15.4 Maintainability

- TypeScript strict mode.
- Shared runtime schemas for IPC and persisted data.
- No `any`-typed cross-process contracts.
- Domain logic independent of Electron so it remains testable.
- MSX logical names centralized and covered by contract tests.
- Upstream `msx-cli` commit and license recorded.

### 15.5 Compatibility

- Windows 11 x64 is required for the initial release.
- Windows on ARM may be evaluated after x64 general availability.
- The application shall not require a separately installed Node.js runtime.
- Proxy and enterprise TLS behavior shall use supported Windows/Chromium networking.

## 16. Distribution and signing

### 16.1 Release channel

Initial distribution:

- Private GitHub repository.
- GitHub Release marked as pre-release during pilot.
- Signed per-user installer EXE.
- SHA-256 checksums.
- SBOM and third-party license notices.
- Release notes with database migration and known-issue information.

Do not publish any seeded configuration, local database, token cache, customer name, TPID, or team roster in a release asset.

### 16.2 Installer

The preferred version 1 format is a signed per-user EXE installer, such as NSIS produced by the selected Electron packaging tool. It should:

- Install without administrator elevation where endpoint policy allows.
- Install under the current user profile.
- Register a normal uninstall entry.
- Preserve local data during an application upgrade.
- Offer a separate, explicit local-data deletion choice during uninstall.
- Avoid a portable unsigned executable as the default distribution.

MSIX should be evaluated for a later enterprise-managed channel through Intune or the Microsoft Store. It is not required for the GitHub Release pilot.

### 16.3 Signing recommendation

Preferred order:

1. Organization-managed Azure Artifact Signing identity and certificate profile.
2. Microsoft internal or corporate code-signing service approved for line-of-business applications.
3. Traditional organization-validation code-signing certificate held in an approved HSM-backed service.

Do not use a self-signed certificate for production distribution.

Artifact Signing eligibility and publisher identity validation must be confirmed before committing to the service. Signing must use SHA-256 and a trusted timestamp so the signature remains valid after certificate expiry.

### 16.4 SmartScreen expectation

The pilot communication must not promise that signing immediately eliminates SmartScreen prompts. New publisher/file reputation can still produce a warning. Signing is nevertheless required because it:

- Displays a verified publisher.
- Allows reputation to build under a consistent identity.
- Supports enterprise allow-listing.
- Protects artifact integrity.

The team should coordinate with internal endpoint-management owners before pilot distribution because WDAC, AppLocker, or browser download policy may require explicit approval.

### 16.5 Release pipeline

Tag-triggered release workflow:

1. Checkout an immutable tag.
2. Restore locked dependencies.
3. Run unit, integration, migration, packaging, and security tests.
4. Build renderer and main process.
5. Produce installer and internal binaries.
6. Generate SBOM and notices.
7. Malware-scan unsigned artifacts.
8. Sign internal binaries first, then the installer.
9. Timestamp signatures.
10. Verify Authenticode signatures and publisher identity.
11. Compute SHA-256 checksums.
12. Smoke-test installation, first launch, upgrade, and uninstall in a clean Windows VM.
13. Publish a draft private GitHub Release.
14. Require maintainer approval before making the release visible.

Use GitHub Actions OIDC or an equivalent short-lived identity for Artifact Signing. Do not store a reusable code-signing private key in repository secrets.

### 16.6 Updates

Pilot:

- App checks a configured private release feed for version metadata.
- App notifies the manager and opens the authenticated release page.
- The manager downloads and runs the signed update.

Post-pilot:

- Add an authenticated auto-updater only after proving private-release authentication, update signature verification, rollback, and database migration recovery.
- Never execute an update based only on transport TLS or a version string.

## 17. Migration and reuse plan

### 17.1 Reuse as-is or with small adaptation

- `diffSnapshots`, `foldChanges`, and change descriptions from `lib/diff.mjs`.
- Normalized milestone shape and MSX logical field names from `lib/msx.mjs`.
- Account-tree batching and disappearance classification.
- Ingest orchestration sequence.
- Snapshot-retention policy.
- Portfolio/account/team/POD calculations.
- Existing offline test cases for diff, API count consistency, people, POD resolution, and disappearance causes.
- Visual concepts and information hierarchy from `webapp.html`.

### 17.2 Refactor

- Replace file paths and repository-root assumptions with application services.
- Replace JSON/gzip persistence with transactional encrypted storage.
- Replace local HTTP routes with typed IPC.
- Replace mutable global renderer state with explicit stores or view models.
- Replace display-name-first people matching with owner-ID-first matching.
- Replace hand-edited account, people, and POD files with settings screens.
- Replace fixed config values with persisted, validated settings.
- Replace single global `fetchInFlight` with per-account jobs and a portfolio coordinator.
- Add pagination, retry, cancellation, and partial-success behavior.

### 17.3 Exclude

- `@github/copilot-sdk/extension`.
- Canvas lifecycle and actions.
- `session.send` and the Explain prompt builder.
- Hard-coded sibling `msx-cli` path.
- Hard-coded customer list, team names, POD mapping, and FY27 dates.
- MSX CLI terminal command framework and write commands.

## 18. Testing strategy

### 18.1 Unit tests

- Account name search query escaping.
- TPID and top-parent resolution.
- Child and duplicate rejection.
- Milestone normalization for missing and formatted fields.
- Diff version gate.
- Added, modified, unwatched, and disappeared records.
- A-to-B-to-C folding and A-to-B-to-A churn.
- Every disappearance cause and UI label.
- Owner-ID and alias matching.
- POD coverage diagnostics.
- Fiscal-year and custom-window calculations.
- Retention and monthly anchors.

### 18.2 Integration tests

- MSAL cache abstraction with fake token provider.
- Dataverse paging and retry with recorded, sanitized fixtures.
- Baseline and second-run transaction.
- Per-account failure during fetch-all.
- Database migration from every supported prior version.
- Encrypted backup and restore.
- Sign-out and local-data preservation.
- Full local-data deletion.
- Typed IPC authorization and validation.

### 18.3 Security tests

- Renderer cannot access Node, filesystem, shell, or generic network APIs.
- Content Security Policy blocks injected inline script.
- MSX comments render only as encoded text.
- OData quotes and control characters cannot alter the generated filter.
- External link allow-list blocks non-MS and non-HTTPS origins.
- Logs and diagnostic bundles contain no token or sensitive payload.
- Tampered update is rejected.
- Installer and nested binaries have valid signatures and timestamps.

### 18.4 End-to-end tests

- Install on clean managed Windows profile.
- First sign-in and Conditional Access.
- Add a top parent from a child search result.
- Reject duplicate TPID.
- Add people and POD.
- Baseline fetch.
- Second fetch with fixture-driven change.
- Review and subsequent folding.
- Upgrade without data loss.
- Uninstall with data retained and with data deleted.

Live MSX end-to-end tests must use authorized test data and must remain read-only.

## 19. Observability and support

Local structured logs may contain:

- Timestamp.
- Application and schema version.
- Correlation/run ID.
- Operation name.
- HTTP status and MSX request correlation IDs where safe.
- Duration and record counts.
- Sanitized error category.

Logs must not contain:

- Tokens or auth headers.
- Full OData response bodies.
- Milestone or forecast comments.
- Customer names or TPIDs by default.
- User email addresses.

No automatic crash upload is required for version 1. If future telemetry is introduced, it requires a separate privacy review, explicit opt-in, documented retention, and proof that customer data cannot be captured.

## 20. Success metrics

Pilot targets:

- At least five peer managers complete setup without developer assistance.
- Median time from install to first baseline under 15 minutes.
- At least 95% of searched customers resolve to a confirmable top parent without manual TPID entry.
- Zero duplicate TPIDs accepted.
- Zero MSX write requests generated.
- Zero tokens or customer records found in release artifacts or diagnostic bundles.
- At least 99% of successful account fetches preserve count consistency across portfolio and account change views.
- No data loss across application upgrade during the pilot.
- Every released artifact passes signature verification.

Qualitative measures:

- Managers understand why a child account maps to a top parent.
- Managers can correct unmatched owners without editing files.
- Managers trust the difference between re-dated, closed, moved, unavailable, and transient records.
- Endpoint-management teams can identify and allow the verified publisher.

## 21. Delivery plan

### Phase 0 - Feasibility and governance

Deliverables:

- Confirm permission to redistribute the relevant `msx-cli` source and use the Dynamics first-party client ID in a packaged application.
- Confirm MSX API and data-handling approval for peer-manager use.
- Confirm Electron acceptance on managed devices.
- Confirm signing identity, Artifact Signing eligibility, and private GitHub distribution policy.
- Prototype encrypted storage binding and packaged MSAL browser login.

Exit criteria:

- Signed hello-world installer runs on a representative managed device.
- Packaged app completes read-only `WhoAmI`.
- Encrypted database survives restart and upgrade.

### Phase 1 - Secure shell and domain extraction

Deliverables:

- Electron security baseline.
- Typed IPC.
- Read-only MSX client package.
- Authentication and identity UI.
- Encrypted database and migrations.
- Ported diff, normalization, and disappearance tests.

Exit criteria:

- Renderer security tests pass.
- No external `msx-cli` checkout is required.
- No plaintext token cache is created.

### Phase 2 - Guided setup

Deliverables:

- Scope setup.
- Account search, hierarchy preview, duplicate protection, and baseline.
- Team user search, roster, aliases, and unmatched-owner flow.
- POD configuration and diagnostics.
- Import/export of configuration.

Exit criteria:

- A clean Windows profile reaches a baseline using only UI flows.

### Phase 3 - Portfolio parity

Deliverables:

- Portfolio and account dashboards.
- Milestone filters and deep links.
- Per-run and folded changes.
- Review watermarks.
- History drill-down.
- Fetch-all progress, retry, cancellation, and partial failure.

Exit criteria:

- Current canvas parity is demonstrated, excluding Copilot explanation.
- Existing behavioral fixtures pass against the desktop domain packages.

### Phase 4 - Distribution pilot

Deliverables:

- Signed installer.
- Release workflow, SBOM, checksums, and notices.
- Backup, restore, reset, and sanitized diagnostics.
- Upgrade and uninstall testing.
- Pilot guide and privacy notice.

Exit criteria:

- Five managers complete a two-week pilot.
- Critical security, data-loss, double-counting, and sign-in defects are zero.

### Phase 5 - General availability

Deliverables:

- Pilot fixes.
- Support ownership and release cadence.
- Enterprise deployment option assessment.
- Auto-update decision.

## 22. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Use of a well-known first-party client ID is not approved for packaged redistribution | Blocks authentication | Governance review in Phase 0; be prepared to use an approved app registration or native .NET/WAM design |
| Electron is blocked by endpoint policy | Blocks installation | Test early on representative devices; retain .NET alternative |
| New signed app still triggers SmartScreen | Pilot friction | Artifact Signing or approved corporate signer, stable publisher identity, endpoint-team coordination, clear pilot instructions |
| Plaintext data or token leakage | High security/privacy impact | DPAPI-protected secrets, encrypted database, log redaction, artifact scans, security tests |
| MSX schema or option values change | Fetch failures or wrong classification | Central schema map, metadata validation, explicit errors, versioned contract tests |
| Search returns a child or ambiguous account | Double counting | Mandatory top-parent resolution and TPID uniqueness |
| Display names change | Incorrect team attribution | Owner-ID-first correlation and explicit aliases |
| Large account tree exceeds current query assumptions | Missing milestones | Paging, batching, continuation-link support, count diagnostics |
| One account failure aborts Fetch all | Stale portfolio | Per-account jobs and partial-success summary |
| Private GitHub release auto-update cannot authenticate reliably | Update failure | Manual signed update in pilot; gated updater later |
| Local database corruption or failed migration | Data loss | Transactions, integrity checks, encrypted backups, tested migrations |
| Sensitive values enter crash reports | Privacy incident | No automatic uploads in version 1; previewed sanitized bundle only |
| Single maintainer and unpinned dependency drift | Supply-chain and support risk | Vendor pinned source, lockfile, CI, Dependabot, SBOM, release approvals |

## 23. Open decisions

These decisions require owner or organizational approval before implementation:

1. Is redistribution of the existing MSX authentication client ID in a packaged desktop application approved?
2. Should the app remain an internal/private GitHub project, or move to an organizational repository?
3. Which verified organization name should appear as the Windows publisher?
4. Can Azure Artifact Signing be provisioned under an eligible organizational tenant, or must a corporate signing service be used?
5. Is Electron permitted under managed-device software policy?
6. Is an encrypted SQLCipher-compatible SQLite distribution acceptable under internal open-source and export controls?
7. Is a private GitHub Release acceptable for pilot binaries, or is Intune/Company Portal required?
8. Should the default date scope be the full current Microsoft fiscal year or a shorter operational window?
9. Should one account be assignable to multiple PODs without a blocking confirmation?
10. How long must snapshots and change history be retained under internal data-handling policy?

## 24. Version 1 release acceptance

Version 1 is ready to release only when:

- A clean machine can install the signed app without Git, Node.js, Copilot, or a sibling repository.
- Interactive MSX sign-in and silent reuse work on a managed Windows 11 device.
- Sign-out removes the app token cache.
- Customer search resolves and displays top-parent information.
- Child selection adds only the top parent.
- Duplicate TPID addition is impossible.
- Team members and PODs can be configured entirely through the UI.
- Baseline and subsequent fetches produce correct snapshots and diffs.
- Disappeared milestones are classified without claiming deletion.
- Folded change counts match across every view.
- No MSX mutation request is available from the production app.
- Data and secrets are encrypted at rest for the current Windows user.
- Backup, restore, reset, upgrade, and uninstall flows pass.
- The installer and nested binaries are signed, timestamped, and verified.
- Release assets contain no local customer, person, token, or portfolio data.
- The SBOM, license notices, checksums, privacy notice, and pilot instructions ship with the release.

## 25. Reference links

### Existing implementation

- `.github/extensions/msx-portfolio/README.md`
- `.github/extensions/msx-portfolio/extension.mjs`
- `.github/extensions/msx-portfolio/webapp.html`
- `.github/extensions/msx-portfolio/config.json`
- `.github/extensions/msx-portfolio/lib/msx.mjs`
- `.github/extensions/msx-portfolio/lib/ingest.mjs`
- `.github/extensions/msx-portfolio/lib/store.mjs`
- `.github/extensions/msx-portfolio/lib/diff.mjs`
- `.github/extensions/msx-portfolio/lib/api.mjs`
- `.github/extensions/msx-portfolio/lib/people.mjs`
- `.github/extensions/msx-portfolio/lib/pods.mjs`
- `.github/copilot-instructions.md`

### MSX client

- [MoimHossain/msx-cli](https://github.com/MoimHossain/msx-cli)
- [MSX CLI package manifest](https://github.com/MoimHossain/msx-cli/blob/1054bed05b05a9bbfe5880a0b66840e024449f65/package.json)
- [MSX CLI authentication implementation](https://github.com/MoimHossain/msx-cli/blob/1054bed05b05a9bbfe5880a0b66840e024449f65/src/auth.ts)
- [MSX CLI API implementation](https://github.com/MoimHossain/msx-cli/blob/1054bed05b05a9bbfe5880a0b66840e024449f65/src/api.ts)
- [MSX CLI configuration](https://github.com/MoimHossain/msx-cli/blob/1054bed05b05a9bbfe5880a0b66840e024449f65/src/config.ts)
- [MSX CLI MIT license](https://github.com/MoimHossain/msx-cli/blob/1054bed05b05a9bbfe5880a0b66840e024449f65/LICENSE)

### Microsoft and platform guidance

- [MSAL.NET browser and broker guidance](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/using-web-browsers)
- [Windows app packaging overview](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/packaging/)
- [Windows code-signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options)
- [Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/)
- [Artifact Signing integrations](https://learn.microsoft.com/azure/artifact-signing/how-to-signing-integrations)
- [SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Storage quotas and browser eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

