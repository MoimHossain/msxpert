# ACR: per-employee Power BI reader

## Goal and scope

Add **ACR immediately below Portfolio**. Reproduce the CSU Console ACR
reader's query semantics and service-hierarchy experience, using its `acr.mjs`
as the behavioral reference. The user confirmed **reader-only**: the separate
ACR-versus-milestone Gap analysis is not part of this increment.

ACR comes exclusively from the internal Power BI semantic models. It is not
MSX milestone revenue, Azure billing, an AI estimate, or an MCP response.
The existing Overview and other application features remain unchanged.

## Employee identity and authentication

- The employee selected in the application's MSX sign-in is the identity
  boundary. MSX supplies identity metadata only, never its access token.
- Use a separate MSAL Node `PublicClientApplication`, public-client ID
  `51f81489-12ee-4a9e-aaae-a2591f45987d`, authority
  `https://login.microsoftonline.com/common`, and delegated scope
  `https://analysis.windows.net/powerbi/api/.default`.
- First use requires an explicit **Connect Power BI** action, opening the
  system browser with PKCE and a bounded, cancellable loopback callback.
  The resulting home-account identity must match the selected employee.
  Reject a different employee; never silently use the first cached account.
- Subsequent status checks and fetches use `acquireTokenSilent` only.
  An expired or interaction-required session offers explicit reconnection;
  routine fetches never open a browser.
- Persist a separate, employee-partitioned MSAL cache outside the repository,
  encrypted with Windows current-user DPAPI through Electron safeStorage.
  No plaintext fallback. Tokens remain in the main process and are never
  sent over IPC, placed in URLs, or written to application logs.
- Disconnect affects the selected employee's Power BI connection only.
  Reset setup also clears that connection but retains encrypted customer
  snapshots, matching the existing reset/data-retention promise.
  Sign-out, cancellation, reset and shutdown cannot leave an abandoned fetch
  writing another employee's snapshot.

## Access and exact query semantics

POST `SemanticQueryDataShapeCommand` requests to
`https://df-msit-scus-redirect.analysis.windows.net/explore/querydata?synchronous=true`.

1. Query access model **6349452**, filtering
   `DimPersonnelNumber.UserAlias` by the authenticated employee's uppercase
   alias and selecting `DimAccountRLSActuals.TPID` and the account name.
2. Intersect the returned TPIDs with currently configured top-parent
   accounts. Deduplicate TPIDs, skip accounts outside this entitlement, and
   never add children as independent ACR accounts.
3. Query ACR model **6692492**, once per permitted TPID and fiscal year
   represented in the rolling window.
4. Select `DimCustomer.TPAccountName`, `DimDate.FiscalMonth`,
   **`M_ACR.$ ACR`**, and `F_ACR.ServiceLevel1` through `ServiceLevel5`.

Preserve all reference filters:

| Field | Filter |
| --- | --- |
| `DimDate.IsAzureClosedandCurrentOpen` | `Y`, `N` |
| `DimCustomer.TPIDTxt` | Exact requested TPID |
| `DimDate.FiscalYear` | Exact fiscal year |
| `ACR_Measures Fields` | `M_ACR[$ ACR]` field parameter |
| `AccountSubscriptionParameter Fields` | `F_ACR[SubscriptionName]` field parameter |
| `ACRFields Fields` | All five service-level field parameters |
| `DimViewType.ViewType` | `Curated` |
| `DIM_SubSegmentHierarchy_SubSegmentId` | Exclude `0, 200, 222, 250, 295, 346, 352, 365, 400, 404, 405` |
| `ServiceCompGrouping` | Exclude `XCR - W365` |
| `DimDate.FiscalMonth` | Only requested months in that fiscal year |

Use the reference's UTC calendar month/fiscal labeling, with July beginning
the next fiscal year. The rolling **12 months include the current open
month**; they are not 12 closed months plus an extra month. Label the open
month provisional. Trend compares the last two closed monthly totals.
Do not silently substitute daily-normalized growth or forecasts.

## Completeness, progress and persistence

- Decode Power BI DSR dictionaries, dimension/measure schemas, repeat/null
  bitmasks, inline values and restart-token continuation. Validate shapes,
  dictionary indices, row widths and finite numeric values.
- Request windows of 30,000 rows, with a bounded page/row/response budget.
  Reject incomplete responses, missing required continuation, repeated or
  cyclic tokens, and continuations that return no new data.
- Limit account concurrency to two. Bound each HTTP request to three
  minutes, with at most three attempts and cancellable backoff for transient
  HTTP 429/5xx/network failures. Never retry authorization denial as another
  employee or fall back to another data source.
- Show access-check, active-account and page progress, completed/total
  accounts, failures, elapsed time and cancellation in a right-hand drawer.
  The last good snapshot remains usable while refreshing.
- Aggregate USD at account/month and all five service hierarchy levels.
  Retain negative adjustments and fractional values.
- Store last-good snapshots in the existing encrypted local vault,
  partitioned by employee. Publish a new snapshot only after **every
  permitted account** succeeds and the selected employee/configured
  account scope still matches the start of the operation.
- Partial failure or cancellation preserves the previous snapshot and
  reports which accounts failed. A successful zero-entitlement result is
  an explicitly empty new snapshot, not retention of revoked accounts.
- Exclude removed accounts from cached display. Disclose changed account
  coverage and stale snapshots instead of implying a fresh complete fetch.

## Page experience

- Explicit connection status and employee identity, Connect/Reconnect,
  Disconnect, Fetch and Cancel actions; visible unsupported-interface notice.
- Account and month multiselects, service search, positive/negative
  closed-month movement filter, Expand all and Collapse.
- Five summary tiles: last closed month, closed-month change, provisional
  current month, rolling 12-month USD total, and level-1 service groups.
- Expandable account > service L1-L5 grid with monthly USD values, closed
  trend and 12-month totals. Preserve ancestor context for filtered children.
  Use a sticky hierarchy column/header and a locally scrolling grid rather
  than overflowing the application.
- Show exact snapshot fetch time, covered months, skipped accounts,
  service-month row counts and the closed-month comparison period.
  No currency mixing or claims that provisional values are final.
- Provide useful first-connection, no-snapshot, zero-entitlement, stale,
  loading and failure states in both existing themes.

## Verification and acceptance

Automated tests must cover exact reference query filters, fiscal boundaries,
DSR encodings and malformed results, pagination, transient retries,
timeouts/cancellation, employee isolation, RLS/top-parent intersection,
closed-month aggregation, scope changes and atomic last-good preservation.
Build/typecheck and source/packaged UI smoke tests must pass.

Live acceptance is separate from those synthetic tests:

1. Explicitly connect the selected employee using this application's own
   new Power BI cache. Do not copy CSU Console/MSX/CLI credentials.
2. Start a fresh headless backend process as the same Windows user. Use
   silent MSAL acquisition and execute a real authorized ACR query with
   no browser session or interactive fallback.
3. Compare one permitted account/closed-month total against the reference
   snapshot, recording both fetch times and any numerical difference.
   Keep real customer/employee data and validation artifacts outside
   repository source and fixtures.

A cached ACR read, a synthetic request, or successful MSAL authentication
alone is **not** live-query proof. If consent, authorization, network access,
or the internal interface prevents validation, report that precise blocker
and leave live acceptance incomplete.

## Support and security constraints

`querydata` and these numeric model IDs are internal, unsupported interfaces;
they may change without notice. Public-client reuse grants no new access.
Every teammate needs their own underlying model permissions, delegated
authorization and row-level security. No Graph access, new app registration,
permission elevation, third-party token reuse, or background browser login
is introduced.

## Implementation and acceptance results

Implemented the reader-only scope above; the separate Gap analysis remains
out of scope. Verification completed on 2026-11-13:

- Build and renderer/main typechecks passed. All **314 automated tests**
  passed across 27 files, including reset credential clearing without
  deleting last-good snapshots or requiring queryable account configuration.
- Direct synthetic comparison with the read-only reference confirmed exact
  access/service query payload parity and three fiscal-boundary cases.
- Full source and packaged UI smoke tests passed in both themes at three
  widths, including ACR hierarchy/filters, progress, cancellation, partial
  failure, snapshot retention, reload and existing application workflows.
  UI validation used software/offscreen rendering; hardware-rendered
  validation is not claimed.
- After explicit initial employee connection, a fresh headless process
  silently decrypted this app's own DPAPI-protected MSAL cache and completed
  actual access-model and ACR-model HTTP queries with **zero browser calls**.
  The closed-month result matched the reference snapshot within one cent.
  Reference snapshot fetch time: **2026-11-12T06:07:56.781Z**. Final live-query
  fetch time: **2026-11-13T07:59:42.687Z**.
- The live comparison was intentionally limited to one authorized account
  and closed month. Full-portfolio atomicity, concurrency and failure cases
  were validated synthetically; a full live portfolio refresh is not claimed.
  Actual customer figures, identities and live evidence remain outside the
  repository.
- Created an isolated unsigned local executable at
  `release\mcaps-acr-reader\win-unpacked\MCAPS Console.exe`.
  All 49 packaged compiled files matched the built outputs byte-for-byte;
  no organization catalogs, private token caches or reference ACR snapshots
  were bundled. No GitHub publication was performed.

The internal-interface and per-employee authorization limitations above
still apply.
