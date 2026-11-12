# PRD: Milestones workspace, reusable exploration, and spreadsheet export

Status: Initial implementation and unsigned Windows test build verified
Date: 2026-11-12

Initial workspace verification: 115 automated tests, production typecheck/build,
and packaged Electron UI smoke passed. The UI checks cover both themes at
1280/900/640 widths, reusable account/portfolio grids, multiselect filters,
invalid numeric bounds, multi-level grouping controls, real all-page XLSX
write/readback and reveal requests, pointer/keyboard resizing, frozen columns,
saved layouts, and retained results after failed reloads. Workbook tests also
cover literal formula-like text, source units/nulls, changed-data rejection,
write/close failures, oversized cells and invalid dates. Column/link follow-up:
six focused tests and the production build passed, followed by packaged UI
checks for visibility, full renderer reload persistence, unsaved row filters,
hidden-column exports, labeled links/copy feedback and toolbar alignment.
Multiline/context-menu follow-up: focused link validation and packaged UI
checks passed for bounded text, full-value tooltips, real right-click menus on
both links, Shift+F10, Escape cancellation and clipboard failure feedback.

The unsigned, unpublished test executable is
`release\mcaps-multiline-links\win-unpacked\MCAPS Console.exe`. Packaged assets match
the production build; ExcelJS, patched writer dependencies and the existing
Copilot runtime are included. Production dependency audit still reports four
pre-existing high advisories in MSAL, fast-uri, js-yaml and zod; those unrelated
dependencies were not changed by this feature.

## 1. Outcome

Make milestone exploration a first-class workspace rather than something
available only through an account or a dashboard tile. Add **Milestones**
between **Portfolio** and **All Changes**, including in the collapsed sidebar.
Every current milestone grid must share the same search, filters, grouping,
ordering, column controls, and filtered Excel export.

The interaction reference is the author's CSU canvas application. Its milestone
page separates row selection from presentation: searchable multi-value facets,
amount bounds, nested grouping, leaf sorting, expand/collapse, and export of
every matching milestone even when a group is collapsed. Reuse those ideas, not
its DOM-moving architecture, embedded data, or organization-specific assumptions.
The reference application remains read-only.

## 2. Scope and boundaries

### Included

- Portfolio-wide view of the latest locally saved milestones for active tracked
  customers; account, dashboard drill-down, and portfolio drill-down reuse.
- Case-insensitive free-text search and multi-value facets with missing values.
- Date and monthly-use bounds, up to three ordered grouping levels, leaf sort,
  group expand/collapse, pagination, and clear/reset controls.
- Resizing every data column, including the milestone name; one user-selectable
  frozen column, with milestone name frozen initially.
- Actual `.xlsx` export of the complete matching set to the current Windows
  user's configured Downloads directory, followed by revealing the saved file.
- Persistent device-local column widths and frozen-column preference.

### Not included

- MSX writes, new scopes, Graph calls, AI, org-catalog enrichment, or fresh
  network calls merely to search, group, sort, or export.
- Canvas-only creator/owner organization and "raised by my team" filters: their
  required enrichment is not present in the desktop app's normalized records.
  Do not present invented data or label ordinary owner data as creator data.
- Arbitrary file-system paths from the renderer, CSV masquerading as Excel,
  external uploads, automatic opening in Excel, or automatic release publication.
- Multi-column pinning, column reordering apart from the chosen pinned column,
  virtualization, cross-device synchronization, or persistent named views.

## 3. Navigation and data

1. Navigation order is Portfolio, Milestones, All Changes, optional Team,
   optional PODs, and bottom-anchored Settings.
2. Milestones is always available, independently of Team and POD switches.
3. The page identifies the configured milestone window and clearly explains
   that it uses saved captures, not a live MSX search. A Reload saved data action
   rereads the vault; MSX refresh continues to use the existing Fetch workflow.
4. A single main-process read enumerates active portfolio registrations and
   their current milestone arrays. Do not fetch each customer's full history.
5. Decorate each returned row with local portfolio account ID, portfolio name,
   and TPID, separate from the actual MSX child-account name and ID.
6. Deduplicate milestone IDs when overlapping registrations expose the same
   record; choose a deterministic first active portfolio registration. Do not
   merge different milestone IDs merely because their names match.
7. Archived registrations are excluded. Accounts without a successful current
   capture contribute no rows; display a coverage warning instead of implying
   that every tracked customer was successfully captured.
8. Loading, no tracked accounts, no saved milestones, load failure, and no
   matching results have distinct, actionable UI states. Failed reads must not
   appear as a successful empty result; retain an explicit Retry action.

## 4. Reusable exploration component

Implement a controlled `MilestoneFilterBar`, independent of data loading,
pagination, drawers, and file access. Its inputs are milestone rows, current
view state, and an on-change callback. A shared, pure domain module defines
selection, options/counts, validation, grouping, and ordering so the main
process export and renderer cannot quietly disagree.

### Search and facets

- Search trims outer whitespace and matches case-insensitively across name,
  number, owner, Raised By, portfolio customer, TPID, MSX account, opportunity, workload,
  region, forecast comments, and milestone comments.
- Facets: status, owner, Raised By, portfolio account, MSX account, commitment, month,
  solution area, Azure region, and workload.
- A facet accepts multiple values (OR within it); different facets and bounds
  combine with AND. An empty selection means unrestricted, not no matches.
- Explicit "(not set)" selections include missing/empty values. Missing owner,
  date, region, account, and amount must not silently become real values.
- Each picker supports searching its choices and reports counts against all
  other active filters. Its own selections do not erase alternative choices.
  Keep selected values visible even when another filter gives them zero rows.
- Large choice lists may limit rendered options with an explicit notice;
  searching must still cover the complete list.
- Keep dropdowns and input labels within their grid cells at narrow widths.
- Date-from/date-to are inclusive calendar dates, independently of the global
  capture window. They cannot retrieve records never captured.
- Minimum/maximum monthly use are inclusive numeric bounds and allow zero and
  negative values. Bounded ranges exclude missing amounts rather than treating
  them as zero. Invalid/reversed bounds show a validation error and disable
  export; never silently ignore the invalid constraint.
- Amounts remain in their source units. Do not imply currency conversion or
  produce an invented aggregate currency total.
- Clear filters removes search, facets, dates, and amount bounds, including
  seeded dashboard filters. It does not discard column layout.

### Grouping and ordering

- A separate presentation toolbar distinguishes "which rows" from "how shown".
- Support zero to three distinct ordered levels chosen from portfolio account,
  MSX account, owner, Raised By, status, commitment, month, solution area, region, workload.
- Groups are alphabetic, with months chronological and missing values last.
  The selected sort key/direction orders milestones inside each final group;
  without grouping it orders the whole matching set. Missing sort values are
  last in either direction and equal values have deterministic ID tie-breaking.
- Show nested group labels, depth, full matching counts, and accessible
  expand/collapse buttons plus Expand all / Collapse all.
- Collapsing is presentation only: counts, page totals, and exports still cover
  all matching milestones.
- Pagination counts milestones, not synthetic group-heading rows. If a group
  spans pages, repeat the necessary heading and retain its full matching count.
- Changing filters, grouping, sort, or page size returns to the first page.
  Preserve the selected dashboard seed on initial mount.

## 5. Milestone grid

### Data columns

Start with milestone name, number, date, status, commitment, monthly use, owner, Raised By,
portfolio account, MSX account, solution area, Azure region, workload, and
opportunity. Keep the existing View action/detail drawer and safe MSX links.
Actual missing values are shown consistently rather than fabricated.

Raised By is the record's MSX Created By (`_createdby_value` and its formatted
name), independent of Owner. Preserve automated/service-account creators rather
than inferring a human requester. Capture creator ID/name during normal fetches;
older cached rows expose nulls until refreshed without rewriting history.
Use creator IDs for facets/grouping when present, disambiguate equal display
names, and retain an explicit missing option. Include name and source ID in
Excel, the name in details, and expose sorting and normal column controls.
Adding the column must preserve existing saved widths, visibility and freeze
choices. No creator-org classification, Graph integration, hierarchy probe, or
new permissions are included in this increment.

The final Links & details column exposes labeled Milestone and Opportunity
links without displaying raw URLs, and View. Each link has a right-click
Copy to clipboard context menu, also accessible with Shift+F10. Canceling the
menu must not write to the clipboard; each menu copies its own link.
Links open in the default browser. Clipboard writes use a trusted, validated
main-process IPC call; both opening and copying accept only HTTPS URLs on the
configured MSX origin. Missing links are unavailable and failures are surfaced.

### Visibility and saved display preferences

- A Columns chooser shows/hides every data column and Links & details.
- At least one column must remain visible; disable its final checkbox.
- Persist visibility, widths and the frozen-column choice locally across view
  remounts and app restarts, including widths of hidden columns.
- Retain a hidden frozen-column preference so showing it restores freezing.
  Label its hidden state in the freeze selector; explicitly freezing another
  hidden column also shows that column.
- Migrate older width/freeze-only preferences without losing them. Malformed,
  duplicate, unknown or all-hidden layouts show the existing recovery warning.
- Do not save search, filters, grouping, sort order, pagination or collapse
  state. Reset columns restores all columns, default widths and frozen name.
- Visibility changes affect presentation only, not filtering or the complete
  export schema. Explain that hidden columns are still included in Excel.
- Align toolbar buttons with the Freeze column input rather than its label.

### Column sizing

- Use fixed column layout and explicit widths; the table may scroll
  horizontally inside its own container, never widen the shell.
- The name column is generous initially and wraps long names. Other truncated
  cells expose their complete text through accessible content/native titles.
  Limit name and other textual columns to two lines with ellipsis; show the
  actual MSX account and workload as secondary one-line ellipsized sublines
  beneath the name. Never substitute the portfolio parent for the MSX account.
- Render account/workload sublines without visible field-name prefixes.
  Differentiate the account with semibold blue and the workload with italic
  purple, maintaining contrast in both themes and field labels in tooltips.
- Provide visible pointer drag handles on data-column headers. Capture the
  pointer during resize, clamp to a usable minimum/maximum, and avoid triggering
  sorting while dragging.
- Handles are keyboard accessible: Left/Right adjust width, Shift increases the
  step, Home restores the column's default. Announce the current width.
- Persist validated widths at the end of resizing, not on every pointer event.
  Reset columns restores defaults and the default frozen name column.

### Freezing

- A labeled Freeze column selector offers None and every data column.
- The chosen frozen column moves to the first position and remains visible at
  the left edge during horizontal scrolling. Explain this behavior in the UI.
- Opaque themed cell/header backgrounds and a separating border/shadow prevent
  scrolling text from bleeding through it in light or dark mode.
- Preserve native table semantics and accessible header sorting. Vertical
  scrolling remains page-owned, consistent with the existing shell design.
- Widths and frozen-column choices are shared across milestone surfaces on this
  device. Invalid saved layout and storage failures are reported explicitly.

## 6. Spreadsheet export

### User experience

- Every `MilestoneTable` exposes Export Excel, not just the new workspace page.
- Export the entire matching result in grouped/sorted leaf order, across all
  pages and collapsed groups. Disable export for no matches or invalid filters.
- A busy state prevents duplicate clicks and blocks updater restart while the
  export is active. Show success only after writing a complete file.
- Default destination is Electron's `app.getPath("downloads")`, honoring a
  redirected Windows Downloads folder. No repository-local exports directory.
- Use a generated timestamp/unique suffix and exclusive creation; never
  overwrite an existing user file.
- Reveal the completed file in File Explorer, selecting it in Downloads.
  If revealing fails after a successful save, retain the file and report
  "saved, but folder could not be opened" with its full path. Do not claim that
  Explorer displayed successfully when the OS API cannot confirm that.
- A failed write must not leave a success message or a partial final workbook.
  Report folder/permission/storage errors and allow retry.
- Disclose that the exported workbook contains unencrypted business data outside
  the app vault; the user controls its subsequent handling.

### Workbook design

- Produce a genuine Office Open XML workbook using a maintained Node library in
  the main process only; do not enlarge the renderer with a spreadsheet engine.
- Milestones sheet: one row per matching milestone, no synthetic group-heading
  rows, in the same fully expanded group/leaf order as the UI. Grouping fields
  remain ordinary columns so Excel filtering remains useful.
- Include all grid fields plus identifiers, TPID, source display amount, status
  reason, forecast/milestone comments, and MSX URLs. Do not infer a currency.
- View sheet records export time, capture window, applied filters, grouping,
  sort, and the local-capture nature of the data. Blank fields stay blank.
- Use a professional font, legible colored headers, wrapped names/comments,
  useful widths, an Excel auto-filter, frozen header row and first column, real
  date cells and numeric amount cells, with no macros or external data links.
- Source strings beginning with `=`, `+`, `-`, or `@` remain literal strings, not
  executable spreadsheet formulas. Source URLs are literal data, not commands.
- Do not add financial formulas or derived revenue totals. Preserve negative,
  zero, missing, and formatted source values distinctly.
- Respect Excel row/cell limits: fail explicitly rather than truncate results
  or comments. The UI/export protocol has documented bounded request sizes.

### Trusted process boundary

- Renderer supplies scope (active portfolio IDs), shared view state, the expected
  matching milestone IDs in order, and a SHA-256 fingerprint of those rows,
  not file paths or workbook bytes. Changed values as well as changed IDs/order
  invalidate the export. Main and renderer use explicit English collation for
  deterministic ordering independently of operating-system locale.
- Main process validates strict IPC payloads, active account scope, group/sort
  keys, bounds, duplicate IDs, and row limits. It rereads cached records and
  recomputes the result with the same pure domain functions.
- If cached records changed and the expected IDs/order no longer match, reject
  with guidance to reload rather than export a surprising selection.
- Data loading and export stay under existing trusted-frame IPC/operation
  handling. Export never acquires new credentials or accesses Graph.
- Do not log business rows, comments, names, filter text, or exported contents.

## 7. Acceptance and validation

1. Sidebar order and collapsed/icon-only navigation include Milestones while
   retaining optional Team/POD behavior.
2. The workspace loads saved rows from active accounts, retains portfolio and
   child-account distinctions, handles duplicates and capture gaps explicitly.
3. Focused domain tests cover search/comments, OR/AND facets, missing values,
   counts excluding the current facet, dates, negative/zero/missing amounts,
   invalid ranges, stable null-last sorting, and nested groups.
4. Existing account and metric grids inherit the shared controls, resizing,
   freezing, drawer behavior, and export without losing seeded filters.
5. Electron checks exercise filter/group/sort/clear/pagination, pointer and
   keyboard resize, persistence/reset, and frozen-column coordinates after
   horizontal scrolling at wide and narrow widths in both themes.
6. Main-process export tests reopen actual XLSX bytes and verify all matching
   rows beyond page one, grouping/sort order, typed dates/numbers, missing cells,
   formula-like strings, frozen panes, auto-filter, and metadata.
7. File tests cover actual fresh files under an isolated Downloads directory,
   unique naming, rejected stale/invalid requests, write failure, reveal failure,
   and successful reveal invocation. Never write test exports into real user
   Downloads or display customer data.
8. Run existing unit/integration tests, typecheck/production build, and the
   expanded Electron regression suite. Package a fresh unsigned Windows test
   executable and verify packaged assets; do not publish without a new request.

## 8. Implementation sequence

1. This PRD, then shared types/domain view pipeline.
2. Cached portfolio milestone read and controlled filter bar/grid.
3. Narrow main-process XLSX writer and Downloads export/reveal.
4. Navigation and existing-surface integration.
5. Focused tests, responsive visual review, and unsigned test packaging.
