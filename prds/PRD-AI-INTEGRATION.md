# MCAPS Console - User-Identity AI and Microsoft 365 Intelligence

| Field | Value |
| --- | --- |
| Status | Draft for review; implementation not approved |
| Version | 1.1 |
| Research date | 12 November 2026 |
| Product | MCAPS Console |
| Parent PRD | [Desktop baseline](PRD.md) |
| Initial platform | Distributed Windows x64 Electron application |
| Recommended AI runtime | GitHub Copilot SDK for TypeScript, using the user's authorized Copilot identity |
| Optional workplace connection | Existing approved Work IQ MCP/client, using its own authentication |
| Hard constraint | No new MCAPS Entra app registration, scope grants, or tenant provisioning in the initial solution |
| Scope of this document | Feasibility research, product requirements, proposed architecture, and validation gates |

This proposal does not authorize implementation, installation of additional software, tenant changes, consent grants, paid-resource provisioning, or transmission of customer/workplace data. No live AI inference or Microsoft 365 data query was performed for this research.

### Initial implementation scope (subsequently approved)

The approved first increment is Settings-only connection configuration and real
synthetic service tests, not account/portfolio AI features. It uses the pinned
bundled compatible Copilot runtime by default (with an optional existing `.exe`
override), because independently installed CLI versions can lag SDK isolation
features. Work IQ uses the existing official local MCP client, one of the
no-new-registration routes below. Its own authentication remains authoritative.
Remote connector reuse, app-triggered browser repair, workplace retrieval and
general user-authored prompts remain future work; the current UI gives normal
official-client sign-in guidance rather than claiming those features exist.

## 1. Decision summary

**Yes: the app can obtain AI through the official GitHub Copilot SDK.** It can drive a local Copilot runtime and use credentials established by the user's Copilot CLI sign-in. This is a documented desktop use case; it does not require the maintainer to ship an API key or run a shared backend. A Copilot entitlement, enabled models, applicable organization policy, and a working runtime are still required. Having the VS Code extension installed is not proof that the CLI has a usable login. [G1][G2][G3]

**Yes: the preferred Work IQ path is through an already-approved official client, not a new MCAPS registration.** Accept the product assumption that users already use signed-in Work IQ/Cowork capabilities day to day. Reuse an existing supported Work IQ MCP setup through the official Copilot runtime or local Work IQ CLI, with that client's normal authorization. Microsoft explicitly documents Copilot CLI connecting to remote Work IQ and opening a browser for Entra authentication, without instructing each user to create a new application registration in that quickstart. SDK-hosted reuse of that exact configuration/cache still needs a feasibility test. [M4][M13]

**Do not design this as "borrow the Cowork application's session."** Reviewed Cowork documentation describes Cowork consuming plugins/MCP servers, including interactive MCP widgets. That direction is different from exposing Cowork itself as an embeddable model API. No general-purpose external Cowork session/LLM API was established by this research. For programmatic Microsoft 365 intelligence, use the documented Work IQ interface; invoke a specific agent only if it is discoverable, authorized, and supported headlessly. [M5][M6][M7]

### Recommended product direction

1. **First increment: Explain with GitHub Copilot.** Optional AI connection, selected local MSX context, streaming explanation, no autonomous writes or workplace access.
2. **Second increment: Microsoft 365 context through the existing approved Work IQ connection.** Opt in to that one connector, preserving its official client's authentication. Start with bounded retrieval/citations if exposed and approved, without adding scopes to MSX or creating a new Entra app.
3. **Separate Microsoft 365 answer mode where appropriate.** Work IQ `ask` can return a Microsoft 365 Copilot answer directly, without routing that answer through GitHub Copilot. It is not a raw model API and must pass a separate read-only/agent-capability gate.
4. **No new registration as a release criterion.** Test both existing-client routes: Copilot runtime with the approved remote Work IQ connector, and an existing official local Work IQ stdio server. Do not copy tokens or inherit every installed plugin. If neither meets supported authentication/isolation requirements, report the block rather than fall back to a newly registered client.

The app remains fully usable without any AI connection. AI is an optional dependency for these new features, not a new prerequisite for MSX sign-in, territory onboarding, dashboards, or updates.

### 1.1 The critical distinction: whose browser sign-in?

The requested experience can still look like MSX sign-in: the user clicks **Connect Work IQ**, the system browser opens if necessary, and the app becomes connected. The difference is who performs OAuth:

```text
MCAPS -> approved Copilot/Work IQ client -> client's normal browser sign-in
      -> client keeps its own credentials -> MCP results return to MCAPS
```

MCAPS does not request a token using a borrowed Microsoft client ID and does not redeem that client's authorization code. The approved official client owns OAuth, redirects, token storage and refresh. Reusing the client is a supported integration approach; impersonating it in a new MSAL application is not.

| Approach | New MCAPS Entra registration? | Decision |
| --- | --- | --- |
| SDK uses existing Copilot CLI GitHub login | No | Recommended for LLM access |
| Copilot runtime uses its already-configured approved Work IQ MCP connection and normal browser OAuth | No new MCAPS registration intended; must verify the exact runtime/connector configuration works without a new client or grant | Preferred Work IQ spike |
| MCAPS launches an already-installed official Work IQ MCP server; server authenticates through its own client | No new MCAPS registration intended; must verify supported installation/session reuse | Alternative approved-client spike |
| MCAPS directly acquires a Work IQ token with its own MSAL client | Needs an approved registration and Work IQ consent, whether new or an explicitly approved existing app | Outside the initial constraint |
| MCAPS copies a Cowork/Office token or supplies somebody else's public client ID | Not a legitimate way to avoid approval | Rejected |

There are still OAuth client registrations and scopes behind the official products. The achievable goal is **no additional MCAPS registration or new grants**, not authentication without any registered client or permissions.

Assume existing tenant prerequisites are satisfied for the user's working client. Do not send users through admin setup again unless diagnostics demonstrate a missing prerequisite for that exact approved path. An ordinary Microsoft Copilot/Cowork browser session alone is not proof of a reusable MCP client session; resolve which supported connection exists without questioning the user's daily access.

## 2. Baseline and change to the original product

The parent PRD explicitly excludes a Copilot dependency and AI-based explanations from version 1. This proposal adds an optional feature increment; it does not make the entire product dependent on Copilot.

Current code inspected:

| Area | Existing implementation | Implication |
| --- | --- | --- |
| Runtime and packaging | `package.json`, `src\main\index.ts`: Electron, React, TypeScript, Node main process, Windows NSIS distribution | TypeScript Copilot SDK fits the stack; validate packaged runtime/native dependencies rather than assuming development-mode success |
| MSX authentication | `src\main\auth.ts`: MSAL Node, system browser, PKCE loopback, silent acquisition, safeStorage-encrypted cache | Keep working MSX resource scopes and cache unchanged; no Graph consent added to MSX sign-in |
| Authorization boundary | `src\main\ipc.ts`, `src\preload\index.ts`, `src\shared\ipc.ts`, `src\shared\types.ts`: trusted sender checks, validated typed IPC | AI credentials and processes belong behind this boundary, never in the renderer |
| Data and context | `src\main\portfolio-service.ts`, `src\main\storage\vault.ts`: local account states, snapshots, folded changes, encrypted storage | Construct selected read-only context through existing services, not by exposing files or the database to an agent |
| Lifecycle | `src\main\operation-gate.ts`, update runtime, `src\main\index.ts` | Cancellation, reset, sign-out, and update restart must coordinate with active AI work |
| UI | Settings, account changes, portfolio and shared Fluent components | Reuse existing visual/error/loading patterns; add explicit provider and source boundaries |

This is a documentation-only change. The file names in section 13 are a proposed implementation map, not work completed.

## 3. What the research establishes

### 3.1 GitHub Copilot SDK

The official SDK supports TypeScript and programmatic agent sessions, streaming, custom tools, model discovery, and local/remote MCP servers. The normal architecture is SDK-to-runtime JSON-RPC, with the CLI runtime hosted as a child process. The SDK manages its lifecycle. [G1][G4]

The published SDK README describes general availability. The latest release observed during research was **v1.0.31**, published 10 November 2026. Its published npm metadata requires Node `^20.19.0 || >=22.12.0` and includes platform-specific optional packages; its source package identifies CLI `1.0.109`. These are research observations, not the approved version pair for MCAPS. Individual APIs remain experimental even though the SDK is GA. [G1][G8][G9]

Two supported deployment choices:

| Choice | Benefits | Costs and qualification |
| --- | --- | --- |
| Explicit installed CLI path | Matches the initial assumption that users already have Copilot; avoids redistributing another runtime | App must resolve and verify the actual executable, validate an SDK/runtime compatibility range, and handle independent CLI updates |
| Matching runtime packaged with SDK | More deterministic installation; official default-setup guidance supports this | Larger package, platform/native dependency and ASAR handling, notices, update/signing review; verify actual published package contents |

**Proposed pilot:** explicitly configured/detected compatible local CLI, launched as an app-owned stdio child. Do not attach to an arbitrary running terminal/chat session. Do not parse human-oriented terminal output when a supported SDK API exists. The SDK documentation says it does not automatically search `PATH`; application discovery is therefore explicit. [G1][G3]

**Production preference:** ship a validated SDK/runtime pair if redistribution/support review and packaged identity-reuse tests pass. Do not silently download or install a runtime on first use.

Authentication is documented to reuse Copilot CLI credentials. The app should let the runtime use them through supported APIs, not read credential files itself. Ambient token variables can take precedence over stored credentials, so simply starting the SDK is not enough to prove the intended user was selected. [G2]

Security matters: the default CLI-like runtime offers coding/OS tools. Use the documented `mode: "empty"` baseline, explicit tool availability, disabled ambient discovery, and a deny-by-default permission handler. No `approveAll` examples from the documentation should be copied into this product. [G1][G5]

### 3.2 Work IQ: three useful interfaces

Microsoft documents Work IQ MCP, A2A, and REST surfaces. For this application:

| Interface | What it provides | Proposed use |
| --- | --- | --- |
| Remote Work IQ MCP through the approved Copilot client | `retrieve`, `ask`, agent discovery, schema discovery, entity operations | Preferred when already configured in Copilot; let that client/runtime retain OAuth ownership |
| Official local Work IQ CLI in MCP mode | A stdio MCP server that authenticates through the official tool | Equally valid no-new-registration route for users with an approved existing installation |
| Work IQ A2A | Agent-level questions and multi-turn responses | Alternative if direct Microsoft 365 agent delegation becomes a product requirement; not needed in the first increment |

Remote endpoint: `https://workiq.svc.cloud.microsoft/mcp`. OAuth resource/application ID URI: `api://workiq.svc.cloud.microsoft`. The MCP server advertises OAuth discovery through protected-resource metadata. These identify a separate service, not MSX or Microsoft Graph. [M2][M3][M8]

The official local tool supports `workiq mcp`, tenant selection, Windows x64/ARM64, and Copilot integration. It requires its own setup, administrative consent, billing assignment, and EULA acceptance. It is proprietary: the SDK's MIT license does not license redistribution of Work IQ. Do not automatically accept its EULA or assume every workstation has Node/npm just because Copilot is installed. [M4]

The remote Copilot CLI quickstart documents installing a Work IQ plugin, browser authorization, and using the Work IQ MCP endpoint. That is stronger evidence for the desired user experience than a custom-app quickstart requiring a new registration. Under the user's assumption, discover/select the already-present connection instead of reinstalling it. Do not equate different marketplace packages, local CLI variants, or identically named servers without inspecting their nonsecret configuration and provenance. [M13]

### 3.3 Retrieval, answers, and actions are different

| Capability | Verified semantics | Product boundary |
| --- | --- | --- |
| `retrieve` | Grounding Markdown plus structured source metadata/citations; public preview | Preferred workplace evidence route; preserve sources and status, do not call it a final answer |
| `ask` | Microsoft 365 Copilot or selected agent produces an answer | Optional explicit delegation; not interchangeable with retrieval, and not guaranteed read-only merely because its name is "ask" |
| `fetch`, `fetch_blob` | Entity/binary reads, subject to resource and tenant limits | Later selected-source reads only; not a whole-mailbox synchronization feature |
| `create_entity`, `update_entity`, `delete_entity`, `do_action` | Mutations/actions | Disabled and unavailable to the model in this proposal |
| `search_paths`, `get_schema` | API discovery, not content search | Internal implementation aid, constrained to approved workloads |

`retrieve` currently does **not** support Dataverse or Power BI as retrieval sources, even where an evolving schema contains those names. Keep the existing MSX client and local snapshots as the authoritative source of account/milestone data. Do not replace verified MSX reads with a general workplace search. [M8][M9]

The current retrieval contract places authoritative data under `structuredContent["application/vnd.ms-workiq.retrieval"]`. Use returned hit metadata for source links; do not infer citations by scraping prose or constructing links from opaque IDs. A transport HTTP 200 can still contain an MCP/tool failure. [M8][M9]

### 3.4 Identity: reuse, not impersonation

There are at least three independent authorizations:

| Connection | Identity and authorization | What "already signed in" can mean |
| --- | --- | --- |
| MSX | Existing Entra/MSAL identity and Dataverse access | Existing app token cache restores MSX access |
| GitHub Copilot | GitHub identity, Copilot entitlement, organization policy/model availability | Runtime can reuse the supported Copilot login; GitHub enterprise SSO may still require attention |
| Work IQ | Entra user, existing approved official client, Work IQ audience/scopes and existing billing/policy | That same client/runtime restores its session or uses its own browser reauthentication; MCAPS never receives its refresh token |

These are not interchangeable. Never pass an MSX token to Work IQ, a Graph token to MSX, a GitHub token to Microsoft 365, or a token issued to an unrelated client to the app's client registration.

Windows sign-in, Office sign-in, MSX sign-in, VS Code sign-in, and Copilot CLI sign-in are not a universal shared token cache. Do not promise zero prompts or WAM/device SSO from the current MSAL Node system-browser implementation. Broker support would be a separate validated change. [G2][M7]

An installed MCP configuration is also not a shared running service. A stdio server is normally launched per client. Connecting to the same remote URL or launching the same approved executable is possible; borrowing another host's active transport, token store, or in-memory session is not an integration contract.

### 3.5 Permissions and consent: no repeat of the Graph regression

Work IQ's documented scopes include:

| Delegated permission | Meaning | Proposal |
| --- | --- | --- |
| `WorkIQ.Read` | Read Microsoft 365 data through Work IQ | Candidate for entity-only reads; validate actual tool requirements before requesting |
| `WorkIQAgent.Ask` | Ask agents on behalf of the user; description includes read/write access through agents | Documented prerequisite for `retrieve` and agent questions; requires explicit admin review even for a retrieval-only product |
| `WorkIQ.Act` | Read and change Microsoft 365 data through Work IQ | Not requested for this increment |

The permissions reference lists admin consent as required for these scopes. Its overview and some older pages differ in permission counts; use the current permission reference plus actual discovery/tool contracts, not a hardcoded count or assumed mapping. Do **not** claim `WorkIQ.Read` alone is enough for `retrieve`: Microsoft's retrieval guide explicitly requires `WorkIQAgent.Ask`. [M3][M9]

**For this increment, do not implement app-owned Work IQ OAuth.** Reuse the user's existing approved client and already-granted permissions. The table above explains the service's underlying authorization; it is not a request to add those scopes to MCAPS or MSX.

For comparison only, custom app-owned remote access would need an approved public-client registration, system-browser PKCE and protected cache. That is technically possible, but contradicts the present no-new-registration constraint unless IT explicitly approves use of a suitable existing registration. The MSX client's current Dataverse grant is not evidence that it is also approved for Work IQ. No client secret belongs in a distributed desktop executable. [M7]

The SDK supports runtime-owned MCP OAuth or host-owned token acquisition. Choose **runtime-owned OAuth with the existing approved connector** for the preferred route; the alternative local Work IQ server owns its OAuth itself. Do not register an MCAPS host-token handler for the same flow, mix code redemption owners, initiate dynamic client registration, or silently change the approved OAuth client/scopes. Preserve client/server-origin identity when looking up cached authorization. [G4]

If the approved runtime cannot reuse its session from an isolated SDK host, first test its documented browser reauthentication for that same approved client. If that requires an additional unapproved client/grant, stop and disclose the limitation. Browser SSO reduces interaction, not the authorization requirements.

No new scope, consent prompt, Graph `/me` request, or Work IQ dependency is introduced into the existing MSX login. Work IQ may access Microsoft Graph-backed paths internally; that does not make it a way around Graph/tenant restrictions. Approval of this PRD alone does not supersede the earlier decision to keep MSX profile capture Graph-free.

### 3.6 Licensing, cost, and data boundaries

- **GitHub:** standard SDK usage consumes the calling user's applicable Copilot allowance/billing; model access and organization restrictions remain in force. Do not promise an unlimited/free LLM endpoint because the user owns a subscription. Discover models and usage at runtime where supported. [G1][G6]
- **Microsoft:** current Work IQ documentation says custom/third-party API usage is consumption-billed through Copilot Credits, independently of Microsoft 365 Copilot licensing. An existing Microsoft 365/Cowork subscription does not establish that MCAPS API calls are covered. Setup requires a billing plan/spending-policy assignment and tenant enablement. No fixed monetary estimate is promised here. [M1][M4][M10][M11]
- **Combined flow:** GitHub reasoning plus Work IQ retrieval can consume both services. Direct Work IQ answers avoid a second GitHub synthesis call when that is all the user wants.
- **Privacy:** local process orchestration is not local inference. Selected prompts/context go to the chosen provider. Workplace context forwarded to GitHub crosses another service boundary; Microsoft 365 permission trimming alone is not approval for that onward transfer.
- **Policy:** approve the actual organizational account/plan, model/provider, sensitivity handling, retention, geography, and intended business use before real customer data is sent. Neither this document nor successful OAuth establishes contractual/compliance approval.

## 4. Options considered

| Option | Assessment | Decision |
| --- | --- | --- |
| Official Copilot SDK + controlled local runtime | Best stack fit; documented user-login reuse, streaming, tools and MCP | Recommended for first AI increment |
| Copilot SDK automatically inheriting all user plugins/MCP/tools | Convenient but imports unknown executables, hooks, instructions, writes, and broad data access | Reject as default; selectively opt in only after inspection |
| Existing remote Work IQ connector through Copilot runtime | Documented CLI-to-Work-IQ path with browser authentication; SDK-hosted reuse must be tested | Preferred no-new-registration workplace spike |
| Approved existing local Work IQ MCP | Uses the official tool's own client/session; validate child-process authentication and feature parity | Alternative no-new-registration route |
| Direct remote MCP with MCAPS-owned OAuth | Would need an approved client registration and service grants | Not part of initial delivery |
| Direct Work IQ answer/A2A only | Valid alternative for Microsoft 365 questions, without GitHub synthesis | Keep available as a distinct future mode, not a generic LLM replacement |
| Cowork plugin | Lets Cowork consume an exposed MCP service; may require hosted infrastructure | Separate future product direction, not the requested embedded desktop AI |
| GUI automation/scraping, private Copilot endpoints, copied Office/VS Code tokens | Fragile, undocumented session reuse and unsafe trust assumptions | Reject |
| Azure-hosted model/backend or BYOK | Can satisfy a different enterprise model policy but introduces separate provisioning/billing/auth | Not first choice under the user's existing-Copilot assumption; revisit only if policy blocks the recommended route |

No product-owned cloud backend is necessary for the recommended local-runtime plus remote-Work-IQ design. Corporate approval and external service access still are.

## 5. Goals and non-goals

### Goals

- Explain selected account/portfolio facts and folded changes using an authorized user's AI access.
- Reuse supported existing login state where possible; provide clear, independent connection status otherwise.
- Add relevant, attributable Microsoft 365 evidence only after the user enables that connection and selects its scope.
- Keep numerical calculations, status counts, top-parent resolution, and review watermarks deterministic in existing app code.
- Make provider, selected context, source freshness, possible usage charges, and cancellation visible.
- Preserve the current app when a provider is missing, denied, offline, throttled, or out of allowance.

### Non-goals

- No shared maintainer API key, credential proxy, hosted inference service, or customer data collection.
- No new MCAPS Entra app registration, new service scopes, altered MSX consent, or tenant/billing provisioning as an initial-feature prerequisite.
- No stealing/repackaging another application's browser cookies, MSAL cache, tokens, or chat session.
- No automatic changes to MSX, Microsoft 365, files, shell, settings, or review state.
- No sending messages, accepting agreements, installing plugins, or enabling paid capacity through the assistant.
- No arbitrary MCP registry, repository agent, personal hook, computer-use, fleet/subagent, or autonomous workflow support.
- No background portfolio-wide AI scan, full-mailbox ingestion, unattended scheduled usage, or cross-manager memory.
- No claim that a discovered Microsoft 365 agent is Cowork or works outside its native Office host.

## 6. Proposed user experience

### 6.1 Settings > AI connections

AI is off until explicitly enabled. Show separate cards:

**GitHub Copilot**

- Selected/runtime path, runtime and SDK versions, compatibility status.
- Verified provider/account label where supported, available models, and entitlement/quota status where available.
- **Check connection**, **Connect / repair sign-in**, and **Disconnect from this app**.
- Explain whether setup opens the normal Copilot sign-in flow. Never embed a password form or ask for a pasted token.

**Microsoft 365 / Work IQ**

- Off, not configured, sign-in required, consent required, policy denied, billing unavailable, ready, degraded, or failed.
- Connection type: existing Copilot-managed remote Work IQ connector or existing official local MCP installation.
- Tenant/account, endpoint/client provenance, enabled read capabilities, and preview notice where relevant.
- **Use existing connection**, **Reconnect in browser** when supported by that client, **Test connection**, **Disconnect**, and sanitized diagnostics. No app-registration/client-secret form in the initial UI.

Do not silently turn on Work IQ when Copilot connects. Missing Work IQ never disables local-context explanations. Connection checks use non-content status/discovery where possible and must not issue an unsolicited billable question. Browser reauthentication belongs to the selected official client; if headless reconnect cannot surface its browser safely, hand off to that client's normal sign-in and retry rather than inventing a `workiq login` command.

### 6.2 Explain changes

1. User opens an account's Changes view and selects **Explain changes**.
2. App prepares a context preview: selected account, scope, snapshot/fetch time, folded changes, selected fields, approximate size, and destination provider.
3. User can omit owner names, comments, financial values, or other sensitive fields. Default context is the selected account's structured facts and watched changes; free-text comments/notes are excluded until selected.
4. User selects **Generate with GitHub Copilot**, acknowledging that the shown context leaves the device and uses their provider allowance.
5. Response streams with **Stop**, provenance, links back to local source facts, and a clear AI-generated label.
6. Suggested actions remain text. Generation cannot mark anything reviewed or modify a record.

Suggested initial prompts: "Explain the material changes," "Summarize delivery risks," and "Draft talking points from these selected facts." These are drafts, not automatically sent communications.

### 6.3 Add Microsoft 365 evidence

1. User chooses **Include Microsoft 365 context** and an explicit time range/source scope, such as selected SharePoint sites or Teams/email source types.
2. App explains which queries/context go to Work IQ and whether retrieved content would also go to GitHub.
3. Work IQ performs bounded retrieval. Results show titles, dates, source links, available sensitivity labels, and incomplete/error states.
4. App applies approved sensitivity rules before onward use. Unknown/missing labels are not automatic clearance; when onward permission is unresolved, keep results in the Microsoft 365 view.
5. Forward only user-selected, permitted excerpts to GitHub after distinct confirmation. Never automatically attach an entire returned document or all matches.
6. Synthesis differentiates local MSX facts, workplace evidence, and AI inference. Conflicting or stale evidence is explicit.

Alternatively, an explicit **Ask Microsoft 365 Copilot** route may return Work IQ's answer directly. Do not silently substitute this route for failed retrieval or claim its answer proves a complete search.

### 6.4 Failure, cancellation, and lifecycle

- Missing/incompatible runtime: show exact repair guidance; do not auto-install or execute an arbitrary discovered script.
- Expired identity: offer repair for that provider only, leaving MSX intact.
- Consent/policy/billing denial: identify the class of block; do not retry through a different identity, plugin, token, or API.
- Throttling/transient outage: bounded backoff with jitter and provider retry hints; no unlimited agent loops or duplicate inference replay after ambiguous completion.
- **Stop:** abort pending tool work/streaming, reject late events by request ID, and visibly distinguish partial output from a completed answer.
- Reset/sign-out/disconnect: cancel work, invalidate consented context and provider-bound sessions, and remove app-owned connection material.
- Updates/restart: prompt to cancel or wait for generation; don't claim safe restart until child processes and app-owned persistence are settled.

## 7. Proposed architecture

```text
Fluent renderer: context preview, consent, streaming, citations
    |
    | Narrow validated IPC; no token, executable, or arbitrary query API
    v
Electron main: AI service + scoped context builder + permission enforcement
    |
    | stdio, app-owned child; existing official client's auth
    v
Copilot SDK + compatible CLI
    |                         |
    | Copilot authorization   | one explicitly approved Work IQ connector
    v                         v
GitHub Copilot cloud      Remote Work IQ MCP -> Microsoft 365 / Entra

Alternative: main's controlled MCP client -> existing official Work IQ
stdio server -> Microsoft 365 / Entra; the server owns authentication.

Existing PortfolioService and VaultStore supply bounded local facts.
Existing MSX AuthService remains independent and Graph-free.
```

### 7.1 Context and tools

Prefer a prepared context packet over an unrestricted agent. Initially expose no general filesystem, shell, browser, network-fetch, memory, or write tools.

If interactive tools are later needed, register narrow read-only functions such as `getSelectedAccountFacts` and `getSelectedAccountChanges`. Main-process code validates account IDs against the user's selected context, enforces page/field/result limits, and uses existing services. The model cannot expand from one selected account to the entire portfolio.

For Work IQ, use a host-controlled policy wrapper around the selected runtime/server connection, with explicit MCP tool names and argument/path restrictions. Do not hand the model `tools: ["*"]`. Arbitrary `fetch` paths, blob downloads, function names, agents, URLs, and opaque IDs are not accepted from the renderer/model without validation.

The preferred SDK-managed remote connection must preserve the existing approved client's OAuth ownership while supporting account provenance, read-only restrictions, consent, citation interception and data-egress controls. A `retrieve` result must not automatically enter a GitHub model context before onward-transfer approval: verify pre-tool/post-tool interception or explicit tool invocation that withholds unapproved results. If the runtime cannot enforce that, keep workplace results out of the model path or use the official local server with a direct controlled MCP client. Do not switch to new app-owned OAuth to work around the constraint.

### 7.2 Runtime and authentication isolation

- Launch by verified absolute path and argument array, without prompt-to-shell interpolation. Sanitize inherited credential/provider/telemetry environment variables; preserve only explicitly approved runtime/network requirements.
- Use an app-owned working directory and empty mode, with no repository/personal instruction, hook, skill, plugin, or MCP auto-discovery.
- Validate the chosen SDK's supported controls on a cold start, before any discovered server or hook can execute. A post-start permission filter is too late.
- Do not read, duplicate, relocate, or delete global Copilot/Work IQ credential stores. Let the official client own its login.
- Use app-owned session storage or a supported session filesystem, separate from unrelated CLI conversations. Validate that isolating storage does not break intended login reuse; these are separate feasibility gates.
- A blanket separate `COPILOT_HOME` may also hide the approved connector/authentication. Do not prescribe it as a guaranteed solution: test supported session-storage isolation with retained runtime-managed identity before choosing the layout.
- A new provider account/tenant creates a fresh session and context. Display the selected GitHub identity separately from the MSX and Work IQ identities; email similarity is not proof of account linkage.
- If a trusted provider-account identifier is unavailable, show unverified status and block customer-data submission until identity can be established through a supported flow.
- Disconnect/reset clears app-owned material, not the user's global CLI login or other applications' sessions. Do not log out other tools as a side effect.

### 7.3 Storage and privacy

The existing encrypted vault can store app-owned AI preferences and, only if explicitly enabled, transcripts. Default conversation history is session-only from the user's perspective; verify **all** runtime/session/log/tool persistence before claiming nonretention.

SDK documentation describes persistent CLI session files by default. A UI that merely avoids storing messages in React/localStorage is not sufficient. Production must either route session data through an approved protected store or enforce documented app-owned cleanup and disclose unavoidable retention. Shared CLI credentials must not be copied as a shortcut to storage isolation. [G3][G5][G7]

Disable content telemetry, remote session sharing, cloud session execution, memory, and diagnostic payload capture by default. Debug streams can contain prompts, tokens, tool arguments, paths, or workplace content; sanitized error codes/correlation IDs are the diagnostic default. [G4]

Provider-side retention and compliance follow the approved service terms, not the app's local deletion setting. User deletion of a local transcript must not claim to delete provider logs.

## 8. Functional requirements

| ID | Requirement |
| --- | --- |
| AI-01 | Optional AI setup never changes existing MSX authentication or baseline availability |
| AI-02 | Establish runtime compatibility, selected provider identity, entitlement, and explicit data consent before customer-data inference |
| AI-03 | Use supported credential reuse; clear repair paths for missing login, Conditional Access, or admin consent |
| AI-04 | Preview exact selected context/destination; bind consent to the request, provider identity, scope, and fields |
| AI-05 | Stream output, cancel promptly, and prevent stale events from a prior account/request appearing in the current view |
| AI-06 | Preserve deterministic source values and timestamps; distinguish inference from recorded facts |
| AI-07 | Enforce read-only behavior in code/tool registration, independent of the prompt |
| AI-08 | Discover supported models and Work IQ tool schemas; handle absent/experimental features explicitly |
| AI-09 | Work IQ is separately enabled and scoped but uses an existing approved client's authentication; no new registration/scope grant is required by initial setup |
| AI-10 | Preserve structured citations and security metadata; allow only validated, user-facing source links |
| AI-11 | No silent fallback between providers, identities, models with different approved policies, or retrieval/answer modes |
| AI-12 | Reset/disconnect/restart has explicit cancellation and app-owned session/cache cleanup semantics |
| AI-13 | Surface actual usage when available, unknown usage as unknown, and a configured bounded execution budget |
| AI-14 | Block automatic mutations, plugin installation, EULA acceptance, paid provisioning, and arbitrary child processes |

## 9. Reliability and security requirements

- Bound input/output size, context records, retrieval results, retries, tool-call counts, wall time, and concurrent runs. Start with one active foreground generation per window. Choose numerical limits during the feasibility spike, not by silently truncating facts.
- Explain truncation/partial retrieval in the UI and source packet. Do not label capped results "all."
- Parse transport errors, JSON-RPC errors, MCP `isError`, per-result statuses, and retrieval terminal states. A successful connection/token exchange is not a successful content query.
- Preserve opaque source identifiers and supported continuation links exactly; follow only validated supported paging. Tenant limits or blocked continuations mean partial coverage, not an empty or complete result.
- Treat retrieved text, tool metadata, skills, prompts, and model output as untrusted. They cannot change consent, authorize a write, choose an executable, or override app source boundaries.
- Render safe Markdown/text without executing raw HTML, scripts, remote images, or tool-generated commands. Source navigation must validate HTTPS origins and reject credential-bearing URLs.
- Honor tenant denies and sensitivity restrictions. Do not represent a prompt instruction such as "read-only" as an authorization control.
- Do not enable `ask` with arbitrary agents until indirect mutation capability is constrained by verified service policy/capability. Keeping local mutation tools disabled does not constrain a remote autonomous agent.
- Do not advertise a mathematically exact spending cap from token counts or advisory quota fields. Show provider-reported usage and enforce available SDK limits, while disclosing potential in-flight/delayed charges. [G6]
- Revalidate dependency security, runtime redistribution terms, signing, supported enterprise use, and tenant data handling before distribution. Existing unsigned pilots are not production security approval.

## 10. Feasibility gates before implementation rollout

These are proposed experiments after PRD approval, not tests already performed.

| Gate | Test | Pass condition / consequence |
| --- | --- | --- |
| F1: entitlement and permitted use | Confirm intended users' Copilot plan, organization policy, business-data handling, enabled SDK/CLI/model usage | Authorized organizational use, not merely installed software |
| F2: SDK/runtime pair | Pin a released TypeScript SDK and compatible Windows runtime; synthetic prompt with no business data | Supported packaged protocol/features, streaming/cancel, explicit process shutdown |
| F3: supported login reuse | Launch the app-owned runtime using an existing CLI login; repeat from Explorer without a developer shell | Correct verified identity, no copied tokens, clear missing-login path |
| F4: cold-start isolation | Install synthetic malicious test hooks/plugins/config; initialize empty mode with explicit settings | No unintended process, tool, instruction, MCP or external connection starts |
| F5: persistence | Inspect isolated synthetic runs, crashes, cancellation and reset | No undisclosed plaintext business transcripts/logs; unrelated CLI auth/history untouched |
| F6: local Work IQ option | Already-approved supported installation, known tenant, normal server login; inspect `tools/list` | Authentication is reusable or repaired by that official client's browser flow; no new client/grants, no borrowed host session |
| F7: existing remote Work IQ connector | Select approved Copilot connector, start via SDK with runtime-owned OAuth; validate same client/tenant, synthetic source, then expired-session repair | Correct user, discovery, citations and supported browser reconnect without creating another app or granting additional scopes |
| F8: read-only workplace access | Test the exact approved tools/scopes/policy including adversarial instructions and indirect agents | No local or remote write route; leave unsafe agent questions disabled |
| F9: preview and transfer approval | Review retrieval preview acceptance and M365-to-GitHub handling with tenant owner | Approved optional pathway; otherwise keep workplace content out of GitHub synthesis |
| F10: distributed packaging | Clean Windows user, no developer checkout/Node assumption, proxy/Conditional Access, update/restart | AI remains optional; dependencies are present or clearly diagnosed; no hidden installs |

**Release rule:** F1-F5 and F10 gate local-context AI. F6 or F7 must establish a no-new-registration Work IQ route; F8-F9 additionally gate workplace/combined features. Failure to reuse the approved client safely must not block shipping approved local-context AI, and must not silently expand scope into app registration.

## 11. Acceptance tests

### Unit and protocol tests

- Selected account/scope/field redaction, bounded context, excluded free text, deterministic money/count/date formatting.
- Identity changes invalidate consent; expired/denied/ambiguous authentication never falls back to another identity.
- Cold-start empty-mode configuration and tool allowlists; malicious retrieval cannot widen account/source scope or execute commands.
- Work IQ discovery/schema variations; missing `retrieve`, nested errors, partial/cancelled retrieval, citations, labels, and no fabricated links.
- Stop/timeout/late-event handling, bounded retries, no duplicate replay after unknown completion.
- App-only reset/disconnect cleanup; preserve MSX history/auth behavior and external CLI credentials.

### Electron and packaged tests

- Fluent context preview, independent connection cards, streaming, Stop, retry and admin-blocked states in light/dark mode.
- No token/credential/path authority crosses preload; untrusted IPC sender/input is rejected.
- Existing MSX-only onboarding, profile, territory import, review, scrolling, reset, and updater smoke remain passing.
- App launched from Explorer reuses supported login or asks clearly; missing runtimes never trigger silent installation.
- Expire the selected Work IQ client's test session: its supported browser reconnect restores access without creating an Entra app, changing scopes, modifying MSX authentication, or copying tokens.
- Update/restart and reset during generation cancel or wait safely; app-owned children do not leak.
- Packaged artifacts contain only approved SDK/runtime binaries and notices, no developer data, prompt logs, tokens, or personal MCP configuration.

Use synthetic local fixtures and an authorized isolated Microsoft 365 test source before any real portfolio data. Successful tests must record the SDK/runtime/server versions and observed policy, not imply every tenant is equivalent.

## 12. Delivery increments

1. **Feasibility spike:** F1-F5, synthetic inference, compatibility and auth/storage decision record. Stop if identity isolation or persistence cannot meet requirements.
2. **Local-context MVP:** settings connection, selected-account explanation, consent, streaming/cancel, source provenance, lifecycle tests and installer validation.
3. **Work IQ pilot:** select the existing approved Copilot connector or official local Work IQ server; validate cached login and browser repair, retrieval/citations, and no new registration/grants. No tenant provisioning or automatic onward sharing.
4. **Combined evidence:** approved M365-to-GitHub excerpt selection and grounded synthesis.
5. **Explicit agent answers, later:** direct Work IQ `ask`/A2A only where capabilities and read-only governance have been proven.

Each increment is separately reviewable and feature-gated. No implementation starts from this PRD without agreement.

## 13. Proposed implementation footprint

Keep the first increment small; no generalized provider/plugin platform.

| Files | Proposed role |
| --- | --- |
| `package.json`, `package-lock.json`, packaging configuration, notices | Pinned SDK/runtime dependency and Windows packaging; no dependency added by this PRD |
| `src\main\ai-service.ts` (new) | Copilot runtime/session lifecycle, identity/status, streaming, cancellation, deny-by-default tools |
| `src\main\ai-context.ts` (new) | Pure bounded/redacted context builder using existing account/change types |
| `src\main\workiq-client.ts` (new, later increment) | Existing approved MCP connection selection, runtime/server-owned login status, controlled reads and citation/status normalization; no new MSAL OAuth client |
| `src\main\index.ts`, `src\main\ipc.ts`, operation/update lifecycle integration | Own services, trusted IPC and safe shutdown; do not spawn from React |
| `src\shared\types.ts`, `src\shared\ipc.ts`, `src\preload\index.ts` | Narrow validated request/status/event contracts; no arbitrary command/path/token methods |
| `src\renderer\components\settings\SettingsView.tsx` | Independent optional AI connections |
| New focused AI UI components; account `ChangesTab.tsx` and `styles.css` | Context preview, explanation, consent, streaming/citations; existing review action stays independent |
| Focused service/context/protocol tests and `scripts\smoke-updates.cjs` | Synthetic isolation, lifecycle and actual Electron UI regressions |

The Copilot SDK is justified by official protocol/auth/session support instead of hand-rolled terminal automation. A pinned official MCP client dependency is justified only if the controlled local Work IQ server route is implemented. Reuse the vault for app-owned settings; leave existing MSX MSAL configuration/cache unchanged. Validate native/optional platform packages rather than assuming the SDK is pure JavaScript.

## 14. Confirmed evidence, assumptions, and open decisions

### Confirmed by public documentation/package research

- Official TypeScript Copilot SDK supports user CLI-login reuse, custom tools, streaming and MCP.
- SDK README reports GA; released v1.0.31 and its npm/platform metadata were inspected without installation.
- Explicit local-CLI and packaged-runtime deployment are documented; SDK/runtime compatibility remains the app's responsibility for an external CLI.
- Empty mode, explicit MCP configuration, permission controls, and session persistence mechanisms are documented.
- Work IQ has remote MCP and an official local CLI; Microsoft 365 context/answers are programmatically accessible under delegated identity.
- Remote retrieval is still public preview and requires `WorkIQAgent.Ask` per its guide; it is not Dataverse retrieval.
- Work IQ requires administrative authorization/governance and consumption billing; existing Microsoft 365 licensing does not make custom API calls automatically free.
- Cowork plugin guidance describes Cowork calling external MCP tools, not an external app taking over Cowork.
- Microsoft's remote Work IQ/Copilot CLI quickstart explicitly documents browser authentication without a per-user app-registration step. Reproducing it in an isolated SDK-driven desktop process remains untested. [M13]

### Accepted product assumptions

- Users already use signed-in Work IQ or Cowork through Microsoft Copilot or GitHub Copilot in daily work.
- New MCAPS Entra registrations and scope approvals are not a practical prerequisite; the initial implementation must use an existing approved official client path.
- Existing access/consent/billing is assumed for that working path. This does not establish that a different client application, transport, or data destination is also approved.

### Not verified against the user's workstation or tenant

- Installed users' actual CLI versions, entitlement, organizational policy, authentication source, or packaged app login reuse.
- Whether a connector the user calls "Cowork MCP" is Work IQ, a custom gateway, a local package, or a different service.
- Whether existing approved local Work IQ credentials are reusable by a new child process with the required isolation.
- The exact reusable official client/connector, its supported SDK-hosted browser reconnection and account verification, proxy behavior, or sensitivity restrictions in the target tenant.
- Read-only behavior of a remote agent's internal tools, SDK session-storage encryption, or a full packaged end-to-end inference flow.

### Decisions for PRD review

| Decision | Proposed default |
| --- | --- |
| First useful AI capability | Selected-account **Explain changes**, local MSX facts only |
| Pilot runtime | Compatible installed Copilot CLI through the official TypeScript SDK |
| Work IQ route | Existing approved Copilot remote connector with runtime-owned OAuth, or official local MCP server with server-owned OAuth; no new registration |
| Customer-data destination | Approved organizational Copilot identity/model only; separate approval for workplace onward transfer |
| Graph restriction | Existing MSX sign-in/profile stays Graph-free; Work IQ is separate and optional, not an access workaround |
| Transcript retention | No user-visible saved history by default; ship only after runtime persistence is accounted for |
| Cowork | No embedding promise; identify any actual endpoint/agent before evaluating it |
| Microsoft 365 preview | Disabled unless public-preview use is explicitly accepted |

These questions can remain open during PRD review; none justifies guessing credentials, enabling new scopes, or changing the running app.

## 15. Sources

All sources below were reviewed on 12 November 2026. GitHub SDK references are pinned to the observed release where practical; Microsoft service contracts are evolving and must be rechecked at implementation.

- **[G1]** [Official Copilot SDK README, v1.0.31](https://github.com/github/copilot-sdk/blob/v1.0.31/README.md): architecture, supported languages, GA statement, models, entitlement, defaults and license.
- **[G2]** [SDK authentication](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/auth/authenticate.md): stored user login, auth priority, explicit tokens and account boundaries.
- **[G3]** [Local CLI setup](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/setup/local-cli.md) and [bundled setup](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/setup/bundled-cli.md): runtime path, compatibility, deployment and session persistence.
- **[G4]** [SDK MCP integration](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/features/mcp.md): server types, tool allowlists, OAuth ownership, lifecycle and sensitive diagnostics.
- **[G5]** [SDK isolation/multi-tenancy guidance](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/setup/multi-tenancy.md): empty mode, isolated state, session filesystem and ambient-tool risks.
- **[G6]** [Usage/billing metrics](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/features/usage-and-billing.md) and [session limits](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/features/session-limits.md): usage observations and version-sensitive limits.
- **[G7]** [Plugin directories](https://github.com/github/copilot-sdk/blob/v1.0.31/docs/features/plugin-directories.md): explicit plugin loading, discovery and host differences.
- **[G8]** [SDK v1.0.31 release](https://github.com/github/copilot-sdk/releases/tag/v1.0.31).
- **[G9]** [Published npm package v1.0.31](https://www.npmjs.com/package/@github/copilot-sdk/v/1.0.31) and [source package metadata](https://github.com/github/copilot-sdk/blob/v1.0.31/nodejs/package.json): engines, native/platform dependency considerations and runtime version.
- **[M1]** [Work IQ overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/): interfaces, user-scoped access, governance and independent API billing.
- **[M2]** [Work IQ MCP overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/overview): tools and OAuth discovery.
- **[M3]** [Work IQ permission reference](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/permissions): resource URI, delegated permissions, admin consent and broad agent authorization.
- **[M4]** [Official Work IQ CLI](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/cli): installation, prerequisites, local MCP, consent, EULA and proprietary status.
- **[M5]** [Cowork LOB plugin pattern](https://learn.microsoft.com/en-us/copilot/cowork/cowork-connect-lob-api): Cowork as MCP client, separate connector authentication and infrastructure.
- **[M6]** [Cowork MCP Apps support](https://learn.microsoft.com/en-us/copilot/cowork/mcp-apps-support): interactive widgets hosted inside Cowork, not a desktop inference API.
- **[M7]** [Work IQ A2A quickstart](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/a2a/quickstart): public-client registration, delegated identity, headless-agent limitations and independent authorization.
- **[M8]** [Work IQ MCP tool reference](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/tool-reference): tools, structured responses, errors and current source limitations.
- **[M9]** [Work IQ retrieval guide](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/retrieve): public-preview status, permission prerequisites, scoping, source metadata, Dataverse limitation and terminal errors.
- **[M10]** [Enable Work IQ](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/enable-work-iq): tenant setup, administrator role and billing assignment.
- **[M11]** [Microsoft Work IQ licensing announcement](https://www.microsoft.com/en-us/licensing/news/work-iq-general-availability): usage-based Copilot Credits for custom/third-party API consumption.
- **[M12]** [Work IQ MCP governance](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/policy-governance-mcp): layered access control, tenant policies, mutation defaults and policy-denial handling.
- **[M13]** [Connect Copilot CLI to remote Work IQ MCP](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/quickstart/github-copilot-cli): official plugin connection, browser Entra sign-in, endpoint and existing-user permission/policy boundaries; no per-user app-registration step.
