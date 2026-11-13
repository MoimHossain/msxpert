# PRD: Overview landing page and milestone hygiene

| Field | Decision |
| --- | --- |
| Product | MCAPS Console |
| Date | 13 November 2026 |
| Status | Implemented and locally verified |
| Navigation | Overview before Portfolio; default landing page after sign-in/onboarding |
| Data | Existing encrypted local cache; no report scraping, Graph access, AI dependency or automatic network requests |
| Reference | [Pipeline Hygiene report](https://msxinsights.microsoft.com/User/report/215b565d-5923-47a4-959f-5178bb63d184?reportTab=ReportSection0b573eee82e1900bd197&bookmark=Bookmark6815a5bb67d855db97f8) |

The reference URL requires an authenticated report session and could not be
independently read through the available HTTP fetch. The user's supplied rule
table is the normative specification for this increment. Do not substitute the
different stale-comments/capacity rules from the pipeline-hygiene skill.

## Experience

A warm, colorful, energizing landing page: personalized greeting, gradient hero,
distinct Priority total, five colorful priority cards and a visibly separate
coaching card. Add quick actions for Portfolio, Milestones, Organization settings,
reloading local data and explicitly refreshing watched accounts. No celebration
or "all clear" when evidence or coverage is incomplete.

Responsive light/dark designs, readable contrast, visible focus, real buttons,
non-color status labels and reduced-motion support. Keep page-only vertical
scrolling; the drill-down table may scroll horizontally.

## Independently selectable scopes

- **Watched accounts:** latest cached captures of every watched top parent,
  including child-account milestones, irrespective of owner.
- **My milestones:** exact current owner ID equals the signed-in user's cached
  MSX system-user ID. Search all available latest captures, including retained
  captures outside the watched set. Never use manager lines, Team membership,
  display names, aliases or the MSAL account identifier as the MSX owner ID.
- If the account-bound MSX profile ID is unavailable, show Cannot evaluate for
  My milestones. Do not silently fall back to watched accounts.
- This cache does not contain an account-independent complete owner census.
  Explicitly disclose that uncached accounts/milestones cannot be counted. My
  milestones is therefore a view of cached ownership, not an exhaustive live
  MSX pipeline. Historical snapshots are not current ownership evidence.
- Deduplicate by milestone ID, preferring the newest capture across overlapping
  top parents. Retain capture provenance and actual captured windows.

## Rules

All six rules exclude Completed, Cancelled, Lost to Competitor, and explicitly
Hygiene/Duplicate records. Unknown lifecycle is not assumed open.

| ID | Tile | Exact actionable condition |
| --- | --- | --- |
| committed-non-csu | Committed for >7 days and not CSU owned | Open, Committed, actual commitment transition more than seven elapsed days ago, known non-CSU current owner, Enterprise segment, Production or explicitly eligible Intent category |
| due-uncommitted | Due in next 30 days and not Committed | Open, estimated date from the user's local today through today +30 inclusive, known commitment other than Committed; exclude past dates |
| invalid-owner | Missing valid owner | Open, absent owner ID, or cached authoritative evidence bound to that owner ID identifies inactive/no MSX access; not listed on Team is never evidence |
| past-due | Date past due | Open, estimated local business date before today; On Track does not override |
| low-stage | Committed in low stage | Open, Production, Committed, linked opportunity mapped to report stage 1 Listen & Consult or stage 2 Inspire & Design |
| coaching | Coaching: At-Risk or Blocked due in next 60 days | Open, At Risk or Blocked, date from local today through today +60 inclusive; separate from Priority |

Use calendar arithmetic for local date windows, including DST/year boundaries.
Use the actual timestamp for commitment age, never creation time or first
observed snapshot. A raw step name such as `4-4-Inspire & Design` maps by its
meaning to report stage 2, not by its first digit. Unknown stage meanings stay
unknown unless an explicit report-stage number is cached.

## Evidence and aggregation

- Evaluate each milestone/rule as **flagged**, **not flagged**, or **Cannot
  evaluate**, with a precise reason. An established false conjunct can rule out
  an exception without unrelated enrichment, but missing required inputs cannot
  become a clean result.
- Existing records lack transition time, Enterprise/Intent eligibility,
  opportunity stage and authoritative owner validity. Add optional typed cached
  enrichment support; do not manufacture these values or infer validity from
  organization classification. This increment does not acquire new enrichment.
- Show confirmed count and unresolved count independently. If there are no
  confirmed flags but unknown candidates, display Cannot evaluate prominently.
  Drill-downs include a Cannot evaluate view with missing-input reasons.
- Total Priority is the union of the five priority rules, counting and valuing
  each milestone once. Coaching never contributes to that total.
- Monthly pipeline estimates use finite cached monthly values only. Group by
  explicitly cached currency; never guess a currency from `$`, aggregate unknown
  denominations or mix currencies. Show missing-currency and missing-value
  counts. No FX conversion is added in this increment.

## Drill-down and freshness

Click any card or Total Priority to reveal its filtered list on the page. Filter
by exact owner ID, actual account ID, exception and confirmed/unevaluable result.
Show account, owner, milestone and opportunity links, estimated date, status,
commitment, category, mapped stage, monthly value and all precise exception
reasons. Reuse existing MSX link copy/context-menu behavior.

Show local evaluation date, newest and oldest capture refresh times, actual
per-account date windows, missing captures and cached exclusions. Changing the
configured window is not a cache refresh. Warn about bounded windows, uncached
accounts and stale/outside-watched captures; never imply exhaustive coverage.
Reevaluate at local midnight and reload after explicit fetches or organization
changes. Reset/sign-out must not retain the previous page's results.

## Acceptance

1. Overview is first in the rail and the default landing page; existing routes,
   onboarding and navigation continue to work.
2. Tests cover exact current-user ownership, child records, newer overlap
   deduplication, missing capture metadata and genuinely cache-only reads.
3. Rule tests cover day 0/30/60 boundaries, past dates, exact seven-day transition,
   unknown inputs, terminal/Hygiene exclusions, valid false conjuncts, owner-ID
   evidence binding, semantic stage mapping, duplicate union and separate coaching.
4. Currency tests prove no mixed/unknown-currency sum; missing monthly values
   remain explicit.
5. Synthetic Electron UI verifies landing, scope switching, all six cards,
   drill-down filters, unknown results, local reload errors, both themes and narrow
   layout alongside existing smoke regressions.
6. Build/typecheck and appropriate tests pass; produce a separate unsigned local
   executable without publishing or overwriting previous builds.

## Completed local validation

- Production build and renderer/main typechecking passed.
- All 279 automated tests across 23 files passed. Focused follow-up checks also
  passed after adding numeric-status coaching and eligible-Intent edge cases.
- Full source and packaged Electron smoke passed with synthetic data in the
  established screenshot/software-rendering configuration: Overview-first
  landing/navigation, six cards, both scopes, distinct totals and currencies,
  coaching separation, missing evidence, filters, read-error recovery, and both
  themes at three widths. Existing onboarding, history, milestones, organization,
  fetch progress, column preferences, reset and updater flows also passed.
- Overlapping watched/retained captures use the newest record; freshness and
  covered-window disclosure include the capture that supplied that record.
- Packaged compiled assets were checked against the tested build. No employee
  or customer data was used in fixtures, screenshots or the executable.
- Local unsigned executable:
  `release\mcaps-overview-hygiene\win-unpacked\MCAPS Console.exe`.
  This increment was not committed, uploaded or published.
- Live report parity and cross-machine GPU behavior are not claimed. Report-only
  inputs remain Cannot evaluate until trustworthy enrichment is cached, and
  My milestones does not claim coverage of records absent from the local cache.
