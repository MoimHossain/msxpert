# PRD: Work IQ-only organization enrichment for milestones

| Field | Value |
| --- | --- |
| Status | Local catalog import and milestone-first implemented and locally verified; hierarchy exploration remains experimental |
| Date | 12 November 2026 |
| Product | MCAPS Console |
| Related PRDs | [AI integration](PRD-AI-INTEGRATION.md), [Milestones workspace](PRD-MILESTONES-WORKSPACE.md) |
| Goal | Filter milestones by the locally known CSU, STU, ATU or ISD of their creator and owner |
| Hard constraint | No direct Microsoft Graph access, Graph permissions, new app registration or additional consent grants for MCAPS |
| Research route | Existing installed official Work IQ client, MCP question tool, existing user authorization |
| Data boundary | Local encrypted cache; no employee directory, real identities or private org chart in this repository |

This document records the research and the subsequently approved implementation.
The approved increment is the discovery-first Settings workflow below, including
local management and milestone filters. It does not authorize new authentication
grants, software installation, unattended background crawling or publication.
The earlier live research checks were deliberately small and read-only.

## Initially approved hierarchy-first flow (superseded by the revisions below)

1. Add an **Organization** section next to the AI/Work IQ settings. Its
   **Discover organization** and **Manage** actions are enabled only after the
   current Work IQ connection test succeeds. No new left-navigation item.
2. Discover opens a right-anchored, dismissible/reopenable progress drawer.
   Starting from the authenticated MSX user's exact work UPN, request that
   exact person's profile and climb immediate-manager relationships, then
   stop at the first **CVP or country head**, whichever is encountered first.
   Explicit country-head/country-manager/country-general-manager titles qualify;
   an ordinary functional GM, director or generic VP does not.
3. Then explore downward automatically within that boundary. Traverse connector
   managers even if their own title is not a target role; otherwise their
   matching descendants would be missed. Persist only CSU/STU/ATU role matches
   and their specifically identifiable role managers, plus local manual entries.
4. Show the current person/stage, reported boundary, visited/queued people,
   matched/saved people, rejected or partial results and warnings in real time.
   Stop cancels further work; closing the drawer does not. No invented total
   population or percentage.
5. **Manage** opens an organization-management window/drawer from Settings.
   Display name, work UPN/email, alias, title, inferred unit, source and update
   time. Support search, adding a person, editing/correcting a unit and removing
   a local entry with confirmation. Manual corrections survive rediscovery.
6. Store the results in the existing encrypted workstation database. Reconcile
   accessible milestone actor IDs to exact work identities through existing
   MSX authorization, never Graph or display-name guessing. Manual entries can
   also be linked to an explicitly selected MSX user.
7. Use the resulting cache in separate creator/owner org filters, columns,
   grouping and full-result Excel exports throughout reusable milestone grids.
   Cached milestone enrichment remains usable without live Work IQ access.
8. Work IQ question answers still do not constitute an exhaustive directory
   feed. Discovery is bounded and explicitly best-effort: a default maximum
   of 200 requests, 5,000 visited people, 20 downward levels and 60 minutes,
   with at most ten upward hops. Budget exhaustion or incomplete provider
   answers produce a visible partial result, never a false completeness claim.
9. Keep automatic records until explicitly removed or replaced; show evidence
   older than thirty days as stale rather than silently deleting classifications.
   No scheduled refresh or automatic expiry purge in this increment.
10. Build and verify a new separate unsigned local executable after automated
    and packaged UI checks. Do not overwrite the running build or publish it.

## 1. Recommendation

### Approved revision: local catalog import and independent management

- Organization is not an AI-gated feature. With an existing MSX account scope,
  Import, Manage and local add/edit/remove work without AI/Work IQ tests or
  network access. Only the two live discovery actions require tested Work IQ.
- Add **Import catalog** using a native JSON file picker. Accept the reference
  catalog envelope (`generatedAt`, `people`) with `displayName`,
  `userPrincipalName` (or `mail` when UPN is absent), `jobTitle` and `org`.
  Support CSU, STU, ATU, ISD and Unknown without reclassifying imported units.
- Read only the selected local file; never upload it, call AI, copy it into the
  repository, execute its content or modify the reference application.
  Bound input to 10 MiB / 20,000 people. Validate the entire file before writing;
  malformed entries, duplicate addresses, invalid dates and unsupported units
  reject the import atomically with a safe record-position error.
- Merge case-insensitively by exact work address; preserve unrelated records,
  existing MSX links and manual overrides. Reimports update prior imported or
  inferred records, but older catalog evidence must not replace newer evidence.
  Imported classifications survive subsequent AI discovery.
- Retain only minimal local profile fields in the existing encrypted,
  account-scoped vault. Ignore catalog directory IDs, hierarchy, name indexes,
  employment flags and arbitrary metadata. Directory IDs are not MSX user IDs.
  Preserve `generatedAt` as evidence age; importing an old file does not make
  its classifications fresh. Show Imported provenance in Manage and exports.
- Report added, updated, preserved manual and preserved newer counts; cancellation
  is a no-op. No deletion/replacement of the directory occurs on import.
- Import itself performs no network work. Add **Refresh MSX links**, independent
  of AI tests, for exact association through the existing MSX connection.
  Explain that unlinked profiles cannot yet augment creator/owner filters.
  Normal milestone fetch also retains its existing automatic link refresh.
- Tests use synthetic catalogs. Validate compatibility with the actual reference
  file read-only/in memory; never copy real employee records into tests or source.
- The final classified catalog is the distribution source; the raw crawl and
  root list are not needed. A minimal shareable JSON retains `generatedAt`
  and only display name, exact work UPN, job title and organization per person.
  Generate and validate it outside every repository, retain the original evidence
  timestamp and leave distribution to the user's secure channel.

### Approved revision: milestone people first

Following unreliable live hierarchy probes, the user selected **milestone
creators/owners first; CVP discovery remains experimental**.

- The primary Settings action is **Discover milestone people**. Resolve the
  person-type creator/owner IDs already referenced by saved milestones through
  the existing approved MSX connection, then query each unique exact work UPN.
- Request only the person's identity and job title. Do not fetch a manager,
  reports, CVP or any other employee as a prerequisite. A missing manager must
  not prevent classification of a milestone actor.
- Validate every returned UPN exactly; never match names or guess mail aliases.
  Link only nonconflicting exact MSX-ID/UPN associations. Disabled, application,
  non-interactive and team identities remain unresolved.
- Save valid returned actor profiles, including **Unknown** classifications for
  local review. A missing/rejected profile remains unresolved; preserve any
  earlier cache evidence and its original date, without inventing a profile.
  Preserve user-confirmed overrides. Repeated UPNs share one request.
- Persist accepted profiles incrementally. Skip an unavailable/malformed actor
  with a visible specific reason and continue to other actors; an explicit
  access/service denial stops the job, not a switch to another identity/tool.
- Retain cancellation, identity partitions, stale evidence, request/person/time
  limits and one counted format-only correction. Resolve/link the MSX identities
  once per run rather than fetching them again for every accepted profile.
- Progress identifies the milestone-people mode, attempted/queued people,
  matches, saved records, requests and unresolved-profile warnings. Do not show
  a CVP boundary for this mode, or label zero usable profiles as partial results.
- Keep **Explore hierarchy (experimental)** as a separate secondary action,
  using the bounded hierarchy behavior below. It is not the default and is not
  claimed to reliably enumerate the organization.
- Both actions require the successful current Work IQ test. Manage remains
  beside the primary action; existing creator/owner filters and exports use the
  same local directory, without changing MSX records or adding Graph access.

Acceptance requires focused service/parser tests and packaged UI coverage of
the default milestone workflow, including one unavailable actor not preventing
another valid actor from being saved. A bounded live probe must distinguish
exact-profile feasibility from guaranteed availability; do not claim a complete
live actor census from a small sample.

**Yes: useful organization enrichment is feasible through the existing Work IQ
question interface, without MCAPS calling Graph.** Live checks through the same
local-client approach already used by the app returned people profiles, a
management chain ending at a CVP, immediate-report samples, and a small batch
of exact-person profile lookups.

**Do not promise an exhaustive or authoritative directory synchronization.**
The observed interface produces Copilot answers, not a paginated directory
feed. Those answers can omit people, decorate fields with Markdown, vary title
presentation and provide incomplete source references.

Approved sequence:

1. Discover the user's nearest CVP/country-head boundary from Settings.
2. Automatically explore downward within explicit budgets, infer target role
   families and save accepted matches locally.
3. Let users manage/correct the saved directory from Settings.
4. Join saved identities to milestone actors for cached org filtering.

The portfolio-first alternative is not the selected UX. Milestone actors remain
the identity-joining scope, not the discovery root.

### What "no Graph" means here

```text
MCAPS main process
  -> existing official Work IQ client, using its own existing sign-in
  -> supported MCP question tool
  -> Microsoft 365 Copilot people/profile answer
  -> strict validation and deterministic local classification
  -> existing encrypted local vault
  -> creator/owner organization facets
```

MCAPS must not call `graph.microsoft.com`, acquire Graph tokens, add directory
scopes to MSX sign-in, or use Work IQ entity tools as a Graph proxy. Graph-shaped
`fetch`/`call_function` directory requests are excluded from this design too.
Microsoft's service may use directory/Graph infrastructure internally; that is
not an MCAPS Graph integration or a way around tenant policy. Existing Work IQ
approval, licensing, billing and access restrictions still apply. [W1][W2]

## 2. Research performed and actual findings

### 2.1 Method

Inspected the current app's Work IQ launcher, MCP discovery, connection test,
MSX user lookup, milestone identities, reusable filters and encrypted vault.
Then used an isolated research client outside the repository to launch the
already-installed official Work IQ MCP server.

No Graph/entity API was called. No token was copied or exposed. No new app,
permission, consent, EULA acceptance, software installation or client upgrade
was performed. No MSX customer data or entire employee directory was queried.
No live employee identities or raw answers are included in this PRD.

The local package observed was `@microsoft/workiq` version `0.2.8`. Its MCP
catalog advertised `ask_work_iq(question)` and a separate `accept_eula` tool.
Only the question tool was invoked. This catalog did **not** expose structured
directory enumeration, a people paging cursor, or a structured-profile API.
Do not assume tools documented for another Work IQ surface exist here.

### 2.2 Bounded live checks

| Check | Observed result | What it establishes / does not establish |
| --- | --- | --- |
| Signed-in profile and immediate manager | Both returned, including work UPN, title and department | People information is accessible through this existing client; this is still a Copilot-reported identity/relationship |
| Upward manager chain, maximum ten hops | A three-hop chain ending at a title containing CVP was returned | A nearest-CVP candidate can be discovered; this is not independent verification of every edge |
| Immediate-manager report sample | Eight reports returned; response explicitly marked incomplete and reported a larger population | Downward discovery can return useful people; the sample is not an exhaustive member list |
| Re-check CVP profile and immediate reports | CVP title returned again; six reports returned with incomplete coverage | A bounded first downward level works; no transitive subtree was fetched |
| Exact-UPN batch of three already-resolved people | All three requested UPNs matched returned UPNs; profile titles represented the three intended role families | Small profile batches are promising; larger batches and unattended scale remain untested |

The five service calls took approximately **29-43 seconds each** in this
environment. This is a feasibility observation, not an SLA or cost estimate.
One hundred sequential calls at an illustrative forty seconds each would take
about 67 minutes. A CVP-root crawl must therefore not be the default startup path.

### 2.3 Important quality limits observed

- **Requested plain-text names still arrived as Markdown links.** The app must
  not treat a successful JSON parse as successful schema/identity validation.
- The same person received different `EntityRepresentationId` values inside
  Office search links across answers. Those values must **not** be used as
  directory IDs, durable person keys or authoritative relationship IDs.
- Title presentation varied between answers, including added location text.
  Preserve the provider-reported title and its timestamp; do not claim a
  verbatim authoritative directory export.
- Some source entries were blank or generic people-search links. A citation
  is useful provenance, not proof that the app independently read the profile.
- An initial answer used a fenced JSON block; later answers used bare JSON.
  Field names and value shapes varied between differently worded probes.
- Report totals and relationship flags were claims in the answer, not a
  structured enumeration contract. There was no supported continuation token.
- No complete CVP subtree, repeated-run completeness benchmark, packaged
  production enrichment flow or live MSX-to-profile identity join was tested.

### 2.4 Supportability gate

The installed `0.2.8` client is a legacy version. Its successful responses prove
the route's feasibility on this workstation, not its suitability as a shipped
support baseline. Microsoft's current CLI documentation requires a supported
GA client rather than old preview builds. Before implementation release,
repeat the pilot on a supported official client and the packaged application.
Do not auto-update, install or accept terms on the user's behalf. [W1]

## 3. What is possible, conditional, or not supportable

| Capability | Assessment |
| --- | --- |
| Use the already-authorized local Work IQ question tool without adding MCAPS Graph access | Demonstrated on this workstation |
| Obtain a person's title/UPN and small manager/report samples | Demonstrated as Copilot-reported profile facts |
| Find a nearest-CVP candidate and stop upward traversal there | Demonstrated in one chain; handle missing, ambiguous or inconsistent boundaries |
| Cache role-based CSU/STU/ATU enrichment locally and use it offline | Implemented in the encrypted vault; synthetic persistence/filter/export tests pass |
| Recognize explicit role titles and role-specific management titles | Feasible with deterministic, reviewed rules |
| Identify every generic manager's unit from their title | Not reliable; generic titles can manage mixed functions |
| Resolve a Dataverse user ID directly as an Entra user ID | Invalid assumption; requires an identity bridge |
| Guarantee all descendants or all employees under the CVP were found | Not established; question-only answers do not provide an exhaustive paging contract |
| Guarantee a returned job title proves an official organizational-unit membership | No; role-based inference must be labeled as such |
| Know the creator's unit at the original milestone creation date from today's profile | No; current profile data is not historical employment evidence |
| Support unapproved Work IQ access by borrowing MSX/Office tokens or using other client IDs | Excluded |
| Eliminate all Microsoft-side directory infrastructure or authorization | Not promised; only the additional MCAPS Graph dependency is eliminated |

## 4. Product scope

### Approved increment

- Opt-in organization enrichment in Settings, independent of Team/POD switches.
- **Discover organization**, gated by the successful Work IQ test; discovery
  itself performs real people lookups and is not another synthetic marker test.
- Upward CVP/country-head discovery followed by bounded downward traversal.
- **Manage** for reviewing, adding and correcting local classifications.
- Exact identity joining to unique creators and owners in saved milestones.
- Encrypted device-local cache, timestamps, expiry, coverage and unknown reasons.
- Separate **Creator org (Raised By)** and **Owner org** facets and columns.
- Grouping, sorting, details and filtered Excel export using the same enrichment.
- Local review/correction of ambiguous mappings without changing MSX.
- Cache-only filtering/export: no workplace query on each grid interaction.

### Deferred

- Large-population performance and completeness evaluation.
- Organization membership captured at an earlier historical point.
- Sharing caches, centralized directories or cross-device synchronization.

### Not included

- Direct Graph or Work IQ Graph-proxy entity access, app-owned Work IQ OAuth,
  new registrations, scope grants, token extraction or browser scraping.
- MSX writes, employee-profile changes, messages, file searches or arbitrary agents.
- Autonomous overnight full-org crawling or automatic enrichment during Fetch all.
- Guessing a unit from account coverage, a person's name, email/chat activity,
  a department keyword alone, or the user's own unit.
- Treating service/application accounts, team owners or external identities as
  ordinary employees without explicit identity evidence.

## 5. Person identity and joining to milestones

Identity resolution is a release-critical prerequisite, not a name-matching
detail.

1. The existing `createdById` and `ownerId` originate from Dataverse lookup
   values. They are **not assumed to be Microsoft Entra object IDs**.
2. Build the target list from distinct creator and owner IDs, not display
   names. A person appearing in both roles should require one profile lookup.
3. Reuse the existing authorized **MSX/Dataverse** user lookup route for
   identity bridging. The app already reads `systemuserid`, `fullname`,
   `domainname`, `internalemailaddress`, `title` and `isdisabled` for user search.
   The implementation resolves referenced actor IDs in batches of 25, follows
   supported pagination, and skips disabled, application and non-interactive
   users. It is synthetically tested, not live-validated against arbitrary
   milestone actors. [R2][D1]
4. Prefer a validated work UPN/email from that record. If email and UPN differ,
   require an explicit supported association or local user confirmation; do not
   invent an alias or infer a UPN from the display name.
5. Request the exact identity from Work IQ. Require one accepted result per
   input, with an exact case-insensitive identity match or a separately
   user-confirmed association. A single result from an LLM name search is not
   proof that a display name is unique.
6. If needed and actually accessible, a documented Dataverse Entra-object
   linkage could strengthen the bridge. Do not equate GUIDs or invent a
   directory ID from an Office search URL.
7. Respect the owner lookup's entity type. Dataverse ownership can refer to a
   team. Capture/validate that type when available; missing type is unresolved,
   not a reason to reinterpret a team GUID as an employee.
8. Missing IDs in old snapshots, duplicate names, disabled/service users,
   unresolved aliases and conflicts stay **Unknown** with a reason.
   Owner org also requires a captured `systemuser` lookup type. Older captures
   without that annotation remain Unknown until refreshed; retained historical
   snapshots are not rewritten to invent this evidence.
9. A blocked or inaccessible MSX user record remains unresolved. Do not add a
   scope, scrape another application or switch to Graph to fill the gap.

An alternate optimization worth testing is using an already-readable MSX user
title as labeled, potentially stale evidence before asking Work IQ. That is
still MSX access, not Graph. It must not be silently presented as a fresh Work IQ
profile. The initial recommendation remains Work IQ-backed enrichment with the
MSX record providing the identity bridge.

### Identity boundary between connections

Work IQ owns its sign-in. A successful synthetic test currently returns
`identity: null`; it does not prove which person or tenant supplied the answer.
Before persisting org data:

- Bind the job to the current MSX account key and resource/environment.
- Select the intended existing Work IQ tenant through its supported client
  option; do not request new grants.
- Use the already-authenticated MSAL account username/UPN as the explicit
  discovery seed. Do not substitute the cached MSX profile email: mail aliases
  can differ from the actual UPN. Read account key and username together.
  Require an exact case-insensitive returned profile-UPN match; stop on a
  missing or mismatched identity rather than matching by display name.
- Do not ask the question interface to prove the Work IQ client's signed-in
  subject: it does not reliably expose that authentication context. Work IQ
  continues to use its own existing approved sign-in. Display this limitation
  and the starting MSX identity in Settings.
- Partition cache data by environment, signed-in MSX account and selected
  Work IQ tenant. Revalidate on connection or MSX account changes. This is not
  independent proof of Work IQ's authenticated account.

This correction was explicitly approved after the first real discovery failed:
the question interface returned JSON without a valid UPN for an unspecified
"currently signed-in user." Use exact-profile lookup, not a self-identity
question or a Graph fallback. The app must distinguish rejected profile JSON
from a service/access error instead of labeling every first-query failure as
a sign-in problem.

## 6. Classification: role inference, not an official org directory

### 6.1 Initial rule families

Normalize casing, whitespace and approved title abbreviations. Match specific
phrases/token boundaries, not arbitrary substrings or a model's guessed unit.
The rule catalog is versioned and separately testable.

| Inferred unit | Positive role examples | Management examples / cautions |
| --- | --- | --- |
| ATU | Account Executive; Account Technology Strategist; Account Tech Strategist; approved `Acct Tech Strategist` variants | Role-specific account-executive/ATS leadership; generic Sales Manager/GM Sales is insufficient |
| STU | Solution Engineer; approved solution-area/technology/technical sales specialist variants | Solution Engineering Manager; Specialist Sales leadership, including approved abbreviated variants; generic Specialist is insufficient |
| CSU | Cloud Solution Architect; CSA; Customer Success Account Manager; CSAM | CSA Manager/Director; Cloud Solution Architecture leadership; CSAM Manager; approved customer-success leadership variants |

Senior/principal/strategic prefixes, manager/director abbreviations and token
forms such as `SR`, `DIR`, `Acct` and `Tech` require explicit reviewed rules.
The live sample confirmed that abbreviated management/strategist titles matter.

Do not classify every "specialist" as STU, every "account manager" as ATU,
every "architect" as CSU, or every acronym occurrence as a role. Preserve role
qualifiers such as internship in the displayed title; do not infer employment
status from alias prefixes. Ambiguous acronym-only titles require corroborating
role context or review.

### 6.2 Managers and hierarchy

- A manager's **own explicit role-specific title** can support classification.
- A generic Manager, Director, General Manager or CVP title is insufficient.
- One CSU report does not make the manager CSU. A partial set of similarly
  titled reports is not proof of a homogeneous team.
- The same CVP subtree can contain CSU, STU, ATU and unrelated functions. Never
  propagate one unit from the CVP to every descendant.
- Conflicting or mixed-role evidence remains Unknown/Needs review.
- A user can confirm a local classification for a specific resolved person.
  Mark it **User-confirmed**, retain the reason/date and allow removal. It is
  not an official directory change and must not silently spread to descendants.

### 6.3 Evidence states

Store identity resolution separately from classification:

- Identity: exact resolved work identity, user-confirmed association, or unresolved.
- Classification basis: explicit title rule, explicit manager-title rule,
  user-confirmed override, or unknown.
- Unknown reason: missing title, no matching role, conflicting roles, missing
  identity, non-person owner, expired evidence, insufficient source or lookup error.
- Preserve provider, reported title, accepted source reference when present,
  checked timestamp, expiry and rule version.

Do not use the LLM's self-reported numeric confidence as a factual guarantee.
Labels are **inferred role families**, even when a title rule is unambiguous.
Missing or weak evidence must never default to CSU.

## 7. CVP discovery and bounded downward exploration

### Upward discovery

1. Start from the authenticated MSX user's exact work UPN. Verify that the
   returned Work IQ profile matches that requested UPN.
2. Follow reported immediate-manager relationships; do not substitute a famous
   executive or infer missing links from department text.
3. Match `CVP` as a token, `Corporate Vice President`, or an explicit country
   head/manager/general-manager title, case-insensitively. A generic VP or
   functional general manager does not satisfy the boundary.
4. Stop at the **first** matching ancestor. If the subject is already a boundary,
   offer that subject as the zero-hop boundary.
5. Validate any returned multi-hop chain locally; a natural-language request
   to stop is not a hard service-side traversal guarantee. Reject/ignore
   ancestors returned above the first accepted boundary.
6. Bound discovery to ten hops; detect repeated identities/cycles. Missing
   relationships, conflicting titles, absent CVP or a policy denial are
   explicit partial/blocked outcomes.
7. Show the candidate root, path, reported title and limitations in progress
   before continuing automatically downwards. Starting Discover is the explicit
   request for this bounded job; no claim of independent verification is made.

### Downward exploration

Traverse immediate-report relationships in a deduplicated queue within the
chosen boundary. Visit nonmatching manager/connector nodes as necessary:
filtering them out **before traversal** would miss relevant descendants.
Retain the verified upward reporting path transiently. Once its boundary is
established, merge those known direct-child relationships into downward
exploration. A rejected or incomplete boundary report list must not discard
the already-verified path back to the signed-in user's branch. Disclose an
omitted known child as partial coverage; never infer additional relationships.
All branches, including this path, retain the same depth/person/request budgets.
Only matched role profiles and relevant, accepted managers are promoted to the
durable person cache. Keep unrelated connector profiles transient; retain only
minimal encrypted scope/checkpoint metadata needed for the bounded job.

Apply person, depth, request-count and elapsed-time budgets. Stop on cancellation,
denial, repeated identities or budget exhaustion. Preserve validated earlier
results and expose unvisited/partial branches.
If a JSON-shaped response is syntactically malformed, permit one explicitly
logged format-correction request for the same exact profile and relationship
through the same client/tool. Count both requests against the existing budget.
Do not retry missing/mismatched identities, refusals, access/service errors or
arbitrary prose. Show the safe, specific rejection reason for each failed branch
instead of collapsing every failure into a generic malformed-response warning.

For the observed question-only interface:

- A sampled report list is not a complete branch.
- Do not manufacture `$skip`, cursors or an "exclude previous names" paging
  protocol and call it exhaustive.
- A follow-up question can discover additional candidates, but deduplication
  cannot prove there were no omissions.
- Distinguish provider-reported totals from locally accepted counts.
- Job completion means **the bounded discovery attempt finished**, not "all
  people under this CVP downloaded."
- Do not treat people outside the selected CVP scope as non-CSU/STU/ATU. Relevant
  cross-boundary milestone actors require their own allowed exact-person lookup
  or remain Unknown.

## 8. Local cache, privacy and lifecycle

### Storage decision

Use the existing **encrypted SQLite vault**, not a plaintext employee JSON file
in the repository, Downloads or an arbitrary working directory. The current
vault encrypts record payloads with AES-256-GCM and protects the key through
Electron safeStorage/Windows data protection. [R3]

The SQL `kind` and `id` columns are not encrypted payloads. Use opaque record
keys and an encrypted identity index; do not place employee names, aliases,
emails or raw source URLs in cleartext record keys, log messages or filenames.

### Minimal logical record

| Data | Purpose |
| --- | --- |
| Opaque cache ID, schema version and identity partition | Safe lookup and migration |
| MSX system-user association and accepted work UPN/alias | Link to creator/owner IDs without guessing |
| Display name and provider-reported job title | User's requested profile context |
| Inferred unit, job title and discovered/manual source | Explain a classification without a full directory replica |
| Record updatedAt and discovery progress/root | Show cache age and the discovery boundary; no expiry purge |
| Explicit local override, if any | Reviewed correction without changing remote data |

Do not persist raw conversations, emails, profile photos, unrelated reports or
complete response transcripts. An unmatched person already referenced by a
milestone can have a minimal negative-resolution record keyed to the existing
MSX identity; that is not permission to cache unrelated nonmatching profiles.

### Approved defaults

- Opt-in refresh only; no automatic broad network work on startup or Fetch all.
- At most 200 requests, 5,000 visited people, twenty downward levels and sixty
  minutes, with ten upward hops. Limits protect the workstation/service, not a
  claim that a subtree is smaller than those limits.
- One active org job, serialized requests, at most ninety seconds per call
  within the remaining total deadline. Close/release the owned process on stop.
  Client cancellation does not prove already-started service work or billing stopped.
- Retain accepted automatic records until replaced or explicitly removed.
  Evidence older than thirty days is visibly stale; there is no automatic
  expiry purge or silent reclassification to Unknown in this increment.
- Local overrides persist until removed and show their source/age.
  Never silently overwrite a manual decision.
- Sign-out clears decrypted in-memory state. Account/environment changes must
  not expose another partition. Disconnect stops queries; eligible same-account
  cached data can remain available offline with its scope/freshness shown.
- Manage supports confirmed removal of individual local records. Setup reset
  clears the current identity partition. Active work blocks reset until stopped;
  cancellation and scope guards prevent late responses repopulating cleared data.

Local-only storage does not mean data never leaves Microsoft: the query goes
through the existing Microsoft service. Do not route employee profiles or a
directory list through GitHub Copilot merely to assign these labels; the local
classifier needs no LLM. Work IQ's own retention/policy behavior is separate
from the app's cache. Confirm organizational policy permits the proposed local
cache size and use; existing read access does not imply unlimited replication.

## 9. User experience and milestone semantics

### Settings: Organization enrichment

Show connection identity/scope, discovery result, last refresh,
classified/stale saved-person counts, last errors and local-cache
size. Provide **Discover organization** and **Manage**, gated by successful
Work IQ testing. Manage opens a local management window/drawer, not a new
navigation destination. Discovery performs the upward/downward work and shows
the result in its right-side progress drawer.

Network work has a dismissible/reopenable progress panel: actual resolved
people versus known targets, current stage, accepted results, unknowns, rejected
answers, remaining budget and stop/partial status. If the descendant population
is unknown, use indeterminate progress rather than a fabricated percentage.

The existing Settings AI/Work IQ connection gates remain unchanged. A marker
test is necessary connection evidence but not sufficient org capability proof.
Using fresh cached classifications must not require a live connection or a
new paid AI call merely to display/filter a grid.

### Grid facets and columns

Add **Creator org (Raised By)** and **Owner org** as separate multi-value facets:
CSU, STU, ATU and Unknown. OR within one facet; AND between the two facets, just
like other milestone filters.

Examples:

- Owner org = CSU: milestones owned by CSU-role people, regardless of creator.
- Creator org = STU: milestones raised by STU-role people, regardless of owner.
- Creator org = STU and Owner org = CSU: STU-raised milestones currently assigned
  to CSU-role owners.
- Unknown: missing/ambiguous evidence or a non-person owner; explain why.
  Old cached classifications remain selectable and are marked stale in Manage.

Do not label a creator filter "owned by." An either-created-or-owned composite
filter is a possible later enhancement, not an implicit change to AND semantics.

Add corresponding show/hide/resizable columns, group/sort options and detail
fields. Tooltips show title, evidence basis and checked date. Preserve existing
column preferences when adding the columns; do not reset saved widths, freezes
or visibility. Filters remain session-only. Emptying the cache must remove
previously derived row values rather than leaving stale classifications behind.

Use the shared milestone exploration path everywhere: portfolio, account,
dashboard drill-down and historical snapshot grids. The feature must not
depend on the optional Team menu being enabled.

### Current versus historical organization

"Creator org" means **the creator's current cached role classification**, not
the unit they belonged to on `createdOn`. The same caveat applies when resolving
an earlier owner from a retained milestone snapshot.

Display this distinction in help text and export metadata. Do not overwrite
historical snapshots or generate milestone changes when enrichment refreshes.
An organization-at-creation or organization-at-fetch timeline requires separate
dated evidence captured going forward; it cannot be backfilled as fact from
today's title.

### Counts, export and consistency

- Display creator/owner classification coverage over the filtered milestone
  rows, not just how many people were cached.
- Reuse the same accepted enrichment dataset for filtering, counts, grouping
  and all-page Excel export, including hidden-column export behavior.
- Export creator/owner org, evidence basis/freshness and the cache revision when
  enrichment is enabled, with current-role-not-historical-membership wording.
- Attach an org-cache revision to the materialized dataset. An export must use
  that same revision or explicitly reject a stale view and request reload.
  Do not silently use newer classifications and produce different rows from
  those selected by the user.
- Unknown and null data are exported explicitly; no invented organization.

## 10. Implementation boundaries

The implementation separates these responsibilities:

| Area | Responsibility |
| --- | --- |
| Existing official Work IQ runtime adapter | Discover the actual tool/schema; question-only read intent; supported-client checks; strict result-envelope and nested-error handling |
| Main-process org service | Identity binding, bounded queue, cancellation, progress, cache revision and lifecycle |
| MSX user resolver | Resolve only already-referenced actor IDs using existing MSX authorization; handle team/service/legacy cases |
| Pure role classifier | Reviewed deterministic rules, conflicts, versioning and synthetic tests |
| Vault-backed cache | Partitioned encrypted profiles, associations, updatedAt/source and persistent user overrides |
| Shared milestone materialization | Join creator/owner IDs to one pinned enrichment revision without modifying source captures |
| Existing filters/grid/export | Two separate org facets, columns, grouping, coverage and consistent workbook metadata |
| Validated IPC/preload | Typed bounded commands and progress events; no arbitrary prompts, paths or tool names from renderer |

Prefer direct invocation of the selected supported Work IQ question tool over a
general coding agent with filesystem/shell access. Discover tools at runtime,
but do not expose or invoke `accept_eula`, mutation tools, arbitrary agents or
Graph-proxy paths for this feature.

Parse the MCP result envelope first; check `isError` and nested service errors.
Then unwrap the supported provider-specific text/structured answer shape and
validate against a strict application schema. A known outer JSON fence can be
handled explicitly; malformed JSON, rich-text identity fields, unknown enum
values, missing batch members and mismatched UPNs must not be silently accepted.
Keep earlier valid records when another batch fails. Source-link parsing must
never manufacture a person ID.

Prompts request profile-only facts and no actions. This expresses read intent,
but is not proof that a general agent has no capabilities beyond reading.
Supported-client/policy validation and the app's strict callable-tool boundary
remain required. Never follow instructions embedded in returned titles or
source content.

Authentication/consent/policy denial stops the job; no alternate endpoint,
agent, token source or Graph fallback. Throttling honors returned delays within
the total budget. Retries are bounded and disclosed; no retry storm or endless
"try the remaining people" enumeration.

## 11. Validation and acceptance gates

### Approval recorded

The user selected discovery-first Settings UX, CVP-or-country-head boundary,
automatic downward exploration of matching role families, local Manage/add/edit,
milestone filtering, testing and a new local executable. No Graph access,
registration, new grants or public release were authorized.

### Production-readiness pilot / remaining limitations

The local executable is an unsigned test build. Automated validation uses only
synthetic people and isolated storage; it does not establish live directory
completeness or production support for every MSX actor. In addition to the
earlier bounded research, the corrected identity path was checked with one
real exact-UPN profile-and-manager request through the existing official client.
After a real run reached a CVP but saved no people, a separate bounded lookup
returned seventeen accepted immediate-report profiles. Subsequent in-memory
end-to-end probes were not reliable: one failed its initial profile request;
another stopped during the manager climb because Work IQ omitted a required
profile. These are not successful live directory crawls. The UI/contract tests
must not be presented as evidence that the question endpoint reliably enumerates
an organization. No real employee records from these probes were written to
the user's cache or repository.

- Supported official client and packaged app perform real people lookup using
  existing authorization, with no new scopes or registration.
- At least ten representative, user-validated creator/owner identities can be
  bridged through accessible MSX data. Include duplicate names, alias/UPN
  variation, missing legacy fields, team owners and unavailable users.
- Small exact-person batches yield validated identity/title data; formatting,
  missing citations and omitted members are visible failures/unknowns rather
  than accepted factual labels.
- Manually review a synthetic-rule test set and a small authorized real sample.
  Target zero known false CSU/STU/ATU assignments in the reviewed sample;
  report actual coverage rather than imposing a fabricated completeness target.
- CVP discovery stops at the first accepted boundary, detects cycles/missing
  links and rejects an unexpectedly oversized chain.
- No full-subtree claim is made from the question-only interface. If the
  product requires provably exhaustive membership, that requirement is blocked
  under the currently tested interface, not secretly satisfied using Graph.

### Implementation tests

- Synthetic title variants, abbreviations, managers, unrelated specialists,
  mixed-role titles and unknowns; no tests containing real employee records.
- Same-name/different-ID separation and one resolved person used by multiple
  creator/owner references; exact requested identity matching.
- Partial batches, Markdown/code fences, omitted members, invalid/missing
  fields, changing Office representation IDs, nested errors and unsafe URLs.
- Cross-account/tenant isolation, stale/offline use, clear/reset during a
  pending request, late-result rejection and override conflicts.
- Correct independent creator/owner facets and AND/OR semantics across every
  reusable grid; no persisted filters or lost column preferences.
- Export ID/hash and org-revision consistency, historical snapshot semantics,
  missing evidence, literal spreadsheet text and no new MSX change events.
- Both themes and supported narrow widths; progress can close/reopen without
  losing state, while Stop has a distinct effect and partial results remain clear.

### Completed local validation

- `npm run build`: passed renderer/main TypeScript and production compilation.
- `npm test`: 260 tests passed across 22 files, including independent milestone
  actors, unavailable profiles, Unknown review records, override preservation,
  exact links, request limits, format correction and denial stops, plus bounded
  catalog parsing, offline import, merge preservation and import cancellation.
- Source and packaged `npm run test:updates:smoke`: passed using isolated storage
  and synthetic profiles. Coverage includes connection/dirty-config gating,
  first-country-head stopping, unmatched connector traversal, partial results,
  progress reload/cancellation, restart blocking, local add/edit/remove,
  rediscovery preserving corrections, cache persistence, both themes at
  1280/900/640 pixels, independent org filtering and full-result Excel export.
- Packaged archive: all 42 compiled assets matched the source build byte-for-byte.
- Catalog-import source smoke and full packaged UI regression passed with both
  AI tests unset: Import, Manage and explicit MSX linking remain available while
  discovery stays disabled. Coverage includes valid import without Work IQ,
  invalid-file atomicity, cancelled selection, offline add/remove, imported ISD
  preservation during discovery, filters and full-result Excel export.
- The reference classified catalog and its minimized distribution file passed
  the production parser without writing to the user's actual cache. The shareable
  file resides outside the repository; no reference files were modified.
- Corrected identity lookup: the authenticated MSAL username/UPN returned an
  exact matching profile and an immediate manager in one bounded live request.
  No direct reports were requested. This verifies the initial lookup, not a
  complete organization crawl or the Work IQ client's authenticated account.
- The identity-fix package passed the full UI smoke suite. The resize assertion
  waits for drawer transitions to settle rather than sampling an animation frame.
- The recovery package passed the targeted organization UI smoke using isolated
  storage and synthetic profiles. Live end-to-end validation remains blocked
  by inconsistent profile responses; this build is not a proven reliable fix
  for CVP-wide discovery.
- Milestone-first source organization UI smoke and full packaged UI regression
  passed. The primary action checks unique milestone people without traversing
  managers/reports; one unavailable actor does not prevent other profiles from
  being saved. Manage, org filtering, full-result Excel export and prior
  application workflows still pass.
- Bounded live milestone-first sample: three actual referenced identities were
  resolved through existing MSX access, then three exact Work IQ profile-only
  requests returned three accepted role matches with exact MSX-ID links.
  The service completed without traversing a hierarchy. Test records existed
  only in memory; no employee data was added to the user's real cache or source.
  This is evidence for the sampled workflow, not guaranteed actor availability.
- Current local executable: `release\mcaps-org-catalog-import\win-unpacked\MCAPS Console.exe`.
  It is unsigned and unpublished; no earlier executable was overwritten.
- No full-organization census or complete live milestone-actor census was
  performed. Directory coverage remains best-effort,
  subject to the production-readiness pilot above.

## 12. Sources and repository evidence

### Public documentation

- **[W1] Microsoft Work IQ CLI**, read 12 November 2026:
  <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/cli>.
  Natural-language CLI/MCP operation, existing official application setup,
  prerequisites, privacy/permissions and supported-GA-client policy.
- **[W2] Work IQ MCP tool reference**, read 12 November 2026:
  <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/tool-reference>.
  Distinguishes Copilot question tools from Graph-shaped entity tools. The
  broader documented catalog is not proof those tools exist in this local client.
- **[D1] Dataverse systemuser Web API reference**, read 12 November 2026:
  <https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/systemuser?view=dataverse-latest>.
  MSX/Dataverse identity fields are a different data model from directory
  identities; access remains subject to existing Dataverse authorization.

### Existing code inspected

- **[R1]** `src\main\ai-runtime.ts`: official-client launch, live tools discovery,
  synthetic `workiqTestCall`, and `testWorkiq` explicitly returning no verified
  identity or org-search permission.
- **[R2]** `src\main\msx-client.ts`: normalized `_createdby_value`/`_ownerid_value`,
  existing MSX `getMyProfile` and `searchUsers` with work identity/title fields.
  `src\shared\types.ts`: separate creator/owner IDs and names.
- **[R3]** `src\main\storage\vault.ts`: encrypted payloads and protected key,
  with clear SQL record keys requiring care for the new cache.
- **[R4]** `src\domain\milestone-view.ts`, `src\shared\milestones.ts`,
  `src\main\milestone-export.ts`: shared filtering and export consistency.
- **[R5]** `src\main\auth.ts`, `src\shared\ai.ts`: existing MSX account key and
  optional official Work IQ tenant selection; no app-owned Work IQ identity proof.

Live evidence is summarized anonymously in section 2. Returned employee names,
UPNs, internal departments, profile URLs and full org-chart answers must not be
added to the public repository, sample data, fixtures or future PR descriptions.
