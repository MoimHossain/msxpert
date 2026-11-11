# CSU Console - GitHub Release Distribution and In-App Updates

| Field | Value |
| --- | --- |
| Status | Draft - requires product approval before implementation |
| Version | 1.0 |
| Date | 11 November 2026 |
| Parent PRD | [CSU Console Desktop](PRD.md) |
| Release repository | [MoimHossain/msxpert](https://github.com/MoimHossain/msxpert) |
| Initial platform | Windows 11 x64, per-user NSIS installation |
| Scope | Release distribution, private-release access, update UI, download, install, and restart |

## 1. Summary

A user downloads a signed Windows installer from this product's GitHub Releases, installs CSU Console, and subsequently updates it without downloading and running replacement installers manually.

The existing Settings page gains an **Updates** section. The user selects **Check for updates**, reviews the available version and release notes, and selects **Update and restart**. The app downloads and verifies the update while remaining usable, then safely closes, installs, and relaunches. Local portfolio data and configuration remain intact.

The repository may remain private. Private distribution requires each user to have repository access and the installed app to authenticate separately to GitHub. A browser already signed into GitHub does not automatically authenticate the updater, and MSX authentication cannot authorize GitHub downloads.

**Recommended approach:** retain the current Electron/NSIS packaging, add `electron-updater`, publish signed installers and update metadata to GitHub Releases, and use a repository-restricted GitHub App device sign-in for private-release access. This requires maintainer setup but no product-hosted backend and no shared secret embedded in the desktop app.

This is a proposal only. It does not authorize implementation, GitHub App registration, cloud provisioning, or publishing a release.

## 2. Baseline and change to the original plan

The parent PRD's section 16.6 proposes manual signed updates during the pilot and a later authenticated updater. This proposal brings that updater into the next feature increment, subject to the feasibility and acceptance gates below. It supersedes that manual-only approach only after approval.

Current repository evidence:

| Area | Existing implementation | Required change |
| --- | --- | --- |
| Packaging | `package.json`: Electron, electron-builder 26.15.3, NSIS x64, per-user install, stable app ID | Retain installer identity; configure explicit GitHub publishing and updater metadata |
| Signing | `electron-builder.signed.cjs`: Azure Artifact Signing configuration | Enforce successful signing, timestamping, and approved publisher verification for releases |
| Signature policy | `package.json`: `verifyUpdateCodeSignature: true`; default publisher is `Moim Hossain` | Align packaged updater trust with the actual approved signing subject |
| Settings | `src\renderer\components\settings\SettingsView.tsx`: version and existing configuration sections | Add update controls, GitHub connection status, progress, and errors |
| Main process | `src\main\index.ts`: single-instance lock, window lifecycle, vault closure on quit | Own updater lifecycle and coordinate safe install/relaunch |
| IPC | Typed shared API, sandboxed preload, main-process handlers | Add narrow update commands and sanitized state events |
| Local data | Encrypted SQLite in `%LOCALAPPDATA%\CSU Console`, separate protected key and MSAL cache | Preserve directory, encryption material, settings, and identity across upgrades |
| Startup gating | `src\renderer\App.tsx`: normal Settings unavailable before MSX sign-in and account setup | Make update access available from sign-in/setup as well |
| Release automation | No release workflow currently present under `.github` | Add a gated Windows release workflow |
| Updater | No `electron-updater` dependency or update service | Add and validate a compatible, pinned updater version |

Signing configuration is not evidence that an approved signing account, working CI identity, or published production release already exists.

## 3. Goals and non-goals

### Goals

- An authorized user installs the app from a clearly identified GitHub Release asset.
- A packaged app can discover a newer compatible release and update itself.
- Installation and relaunch require no Node.js, Git, GitHub CLI, or Copilot installation.
- The user controls when download and restart begin.
- Updates preserve local data and MSX session material.
- A failed check, download, or verification does not prevent normal app use.
- Production updates accept only approved, signed application installers.
- Private-release authentication never relies on a maintainer's distributed credential.

### Non-goals for this increment

- macOS, Linux, ARM64, MSIX, Store, or Intune distribution.
- A portable EXE with in-place self-update. The downloadable EXE is an installer.
- Silent forced updates, background downloads, install-on-quit, or scheduled checks.
- Public hosting mirrors, licensing, or a product-owned update proxy.
- Stable/beta channel switching, staged rollouts, or automatic downgrade.
- Automatic binary rollback or a general backup/restore UI.
- Changing the existing application-data schema as part of this feature.

## 4. User journeys

### 4.1 First installation

1. The maintainer grants the user read access to the private repository.
2. The user signs into GitHub in their browser and opens the Releases page.
3. Release notes identify Windows x64 support, publisher, installation instructions, and known issues.
4. The user downloads `CSU-Console-Setup-<version>.exe` and runs it.
5. The per-user installer installs the app and creates normal shortcuts/uninstall registration.
6. The app launches into its existing privacy and MSX setup experience.

GitHub access is required to obtain a private installer; it is not required to launch an already installed app or view its local data. Existing MSX sign-in requirements remain separate.

### 4.2 Connect private updates

1. The user opens **Settings > Updates**, or **App updates** from sign-in/setup.
2. The page explains why GitHub authorization is separate from MSX.
3. The user selects **Connect GitHub**.
4. The app displays a short-lived device code and opens GitHub's verification page in the system browser.
5. The user authorizes the registered GitHub App.
6. The app verifies access to this repository's release API and displays **Connected**.

Authorization can be cancelled or skipped. Denial, expiration, or missing repository access produces an actionable message, not an empty release list.

### 4.3 Check, update, and restart

1. The page shows the installed version, release source, connection status, and last successful check.
2. The user selects **Check for updates**.
3. If current, the app shows **You're up to date** and the check time.
4. If newer, the app shows the target version, publication date, release notes, and download size when available.
5. The user selects **Update and restart**. Supporting text explicitly says the app will restart after download and verification.
6. Download progress is visible; the user may continue using the app or cancel the download.
7. Once verified, the app checks for unsaved edits or active operations.
8. If clear, the app flushes/closes local resources, installs, and relaunches automatically.
9. The relaunched app verifies its version and storage initialization, then shows **Updated to <version>** once.

The button grants permission for that specific version's download and restart. It must not later install a different version without renewed consent.

### 4.4 Restart must wait

If a fetch, sign-in, save, or unsaved form is active when the download finishes, the app shows **Update ready - finish your work, then restart**. It does not discard edits or interrupt a write.

The user finishes or explicitly discards their work and selects **Restart to update**. No new mutating operation can begin between the final safe-state check and process shutdown.

Closing the app without selecting restart must not install a cached update automatically.

## 5. Settings experience and state model

Use the existing Settings route; no second top-level Settings page is needed.

Suggested content:

```text
Updates
Installed version: 0.3.0
Source: MoimHossain/msxpert - GitHub Releases
GitHub: Connected
Last checked: <local date and time>

[Check for updates] [Disconnect GitHub] [Open releases]

When available:
Version <next version> is available
<publication date, release notes, optional size>
[Update and restart]
Your work is kept. The app restarts after download and verification.
```

| State | Visible behavior |
| --- | --- |
| Not checked | Show installed version and **Check for updates** |
| GitHub connection required | Show **Connect GitHub** and explain repository access |
| Authorizing | Show code, expiry, browser action, and **Cancel** |
| Checking | Show progress; disable duplicate checks |
| Up to date | Show successful result and timestamp |
| Update available | Show release details and **Update and restart** |
| Downloading | Show percentage, transferred/total bytes when known, and **Cancel** |
| Verifying | Show verification status; do not enable installation yet |
| Ready, restart deferred | Explain the blocker; show **Restart to update** when safe |
| Installing | Show brief restart status, then close for installer handoff |
| Error | Show meaningful reason and appropriate retry/reconnect/manual-release action |
| Unsupported build | Explain that in-app installation requires an installed Windows release |

Requirements:

- Keep update state in the main process so navigating away does not lose progress.
- Expose the same update panel from pre-onboarding and signed-out screens without requiring MSX access.
- Use accessible status announcements and keyboard-operable controls.
- Render release notes as plain text or sanitized Markdown; never execute release HTML.
- Display installed and target versions separately until the new process confirms success.
- Record an attempted-check time separately from the last successful-check time.
- An empty published release feed means **No releases available**, not **You're up to date**.
- Development/unpacked builds must not attempt a real installation.

## 6. Private GitHub authentication

### 6.1 Recommended model

Register a GitHub App owned by the maintainer, enable device flow, and install it only on `MoimHossain/msxpert`. Grant repository **Contents: read-only** and the required metadata access; no write, administration, Actions, or organization permissions.

The app's public client ID may ship in the desktop app. Its client secret, private key, installation-token minting credentials, and CI publishing token must never ship.

Use a user access token obtained through device flow. Its effective access is the intersection of the user's repository access and the GitHub App's installation/permissions. Authorizing the app does not grant repository membership.

The main process owns device polling, token handling, authenticated API requests, and credential persistence. Persist credentials encrypted using Windows `safeStorage`; never put them into plaintext app settings, logs, diagnostics, exports, or URLs. The renderer receives only connection status and the short-lived user-facing device code, never access/refresh tokens.

Use expiring tokens. At expiration, attempt renewal only through a documented, verified desktop-safe flow that requires no embedded confidential secret. Otherwise request device authorization again when the next update check needs it. Do not promise permanent GitHub sign-in: the documented default GitHub App user-token lifetime is eight hours.

Handle authorization pending, polling slow-down, cancellation, code expiry, revocation, and repository access removal explicitly. Disconnect removes local GitHub credentials and cancels outstanding authorization/update downloads; it does not sign out of MSX. Explain how to revoke GitHub authorization on GitHub separately.

### 6.2 Feasibility gate and alternatives

Before full UI implementation, prove device-flow access and installer download for a real invited repository collaborator, not only the repository owner. Validate the selected updater's private GitHub provider with that token.

If this fails, pause and revise this PRD rather than silently broadening permissions or embedding credentials.

Alternatives requiring approval:

| Option | Trade-off |
| --- | --- |
| User-supplied fine-grained PAT | No App registration, but token setup is unfriendly and GitHub documents collaborator limitations; not assumed to work for this private personal repository |
| Classic PAT / OAuth App with `repo` scope | Potentially much broader access than this product needs; not recommended as the default |
| Public binary-only release repository | Simplifies anonymous updates but changes the requested distribution source/privacy |
| Hosted authentication/update broker | Can improve renewal UX but adds infrastructure and operational responsibility |

No automatic fallback to a more privileged credential type is permitted.

## 7. Update engine and trust requirements

- Add a pinned, compatible `electron-updater` production dependency and use its NSIS support, not Electron's separate built-in updater.
- Pin the feed to this repository in packaged configuration. Do not accept renderer-provided feed URLs, repository names, local installer paths, or shell commands.
- Explicitly disable automatic download and install-on-quit. Installation happens only through this feature's approved action.
- Initially consume published, non-draft, non-prerelease releases with valid semantic versions greater than the installed version.
- Do not rely solely on GitHub's **Latest** label: verify semantic version and platform compatibility. No downgrade or same-version reinstall.
- For the pilot, publish the updater-enabled pilot as a normal release in the private repository. Prerelease-channel support is deferred; this intentionally differs from the parent's prerelease pilot recommendation.
- Use HTTPS for GitHub API and artifact downloads. Handle both direct binary responses and asset redirects.
- Prevent GitHub authorization headers from leaking to cross-origin asset/CDN redirects. Use the supported provider behavior and verify it for the pinned updater version.
- Support full installer downloads as the reliable baseline; differential/blockmap downloads are an optimization, not a launch dependency.
- Validate the artifact's updater checksum and Windows Authenticode signature against the approved publisher before it becomes installable. A matching checksum alone does not establish publisher trust.
- Check the final installation target/version against the user's selected release. Do not execute unrelated assets from a release.
- Disable duplicate check/download/install operations; cancel download and invalidate stale callbacks safely.
- Treat incomplete or invalid metadata and missing installers as release errors, not **up to date**.
- Bound requests with timeouts and honor rate-limit retry information. Do not run uncontrolled retry loops.
- Keep approved publisher identity consistent between ordinary and Artifact Signing configurations. Fail production packaging if trust configuration is absent or mismatched.

Current online electron-builder documentation includes newer major-version APIs. Implementation must verify behavior against the selected versions; this PRD does not require an electron-builder major upgrade or assume newer manifest-signing/install APIs exist in version 26.

## 8. Safe shutdown, preservation, and recovery

- Keep `com.moimhossain.csuconsole`, product identity, installation scope, and application-data path stable.
- Preserve accounts, roster, PODs, scope, retention, review watermarks, snapshots, protected vault key, and MSAL cache.
- Coordinate busy/dirty state across main-process operations and renderer forms. UI disabling alone is not a shutdown safety boundary.
- Prevent new writes, finish outstanding writes, close the vault cleanly, and then hand control to the verified installer.
- Keep the single-instance lock compatible with installer relaunch; do not create an install/restart loop.
- Persist a small non-sensitive pending-update record containing prior/target versions and attempt state. On next launch, confirm actual version and storage initialization before declaring success.
- A successful download or installer launch is not a successful update.
- Failures before installer handoff leave the current app usable. Installer execution, power loss, antivirus, or OS-policy failure may require reinstalling a signed release; do not promise atomic binary replacement or automatic rollback.
- Recovery instructions must explain how to reinstall without deleting `%LOCALAPPDATA%\CSU Console`.
- Do not copy an open WAL-mode SQLite file as a purported backup. If future releases require schema migration, first add a consistent backup and tested migration-recovery strategy.
- For this increment and its acceptance pair, keep the portfolio-data schema unchanged. Future incompatible schema releases are blocked until migration/recovery requirements are separately satisfied.
- Never restore an old database automatically after users have written newer data.

## 9. Release and maintainer workflow

Release URL: <https://github.com/MoimHossain/msxpert/releases>.

Required assets for each updatable Windows x64 release:

| Artifact | Purpose |
| --- | --- |
| `CSU-Console-Setup-<version>.exe` | Signed full installer for initial installation and upgrades |
| `latest.yml` | Generated updater version, installer reference, size, and checksum metadata |
| Installer `.blockmap`, if generated/used | Differential download support |
| `SHA256SUMS.txt` | Human/support verification of published assets |
| Third-party notices and SBOM | Parent PRD's distribution requirements |
| Release notes | Changes, Windows requirements, known issues, compatibility/recovery notes |

The packaged app's internal `app-update.yml` contains feed configuration, not a secret. It is not a replacement for the release's `latest.yml`. Do not hand-author checksums or rewrite generated installer metadata after publishing.

Proposed Windows GitHub Actions workflow:

1. Trigger on an immutable `v<version>` tag and require the tag to match `package.json`.
2. Restore with `npm ci`; run tests, typecheck, and production build.
3. Run required dependency/secret/security checks and generate notices/SBOM.
4. Authenticate to the approved signing service using short-lived workload identity.
5. Package/sign application binaries and NSIS installer; generate updater metadata from final artifacts.
6. Verify signature, timestamp, expected publisher, metadata references, version, architecture, and checksums.
7. Upload all assets into a draft release using a CI-only repository publishing token.
8. Smoke-test installation and a real upgrade using the release-candidate artifacts on Windows.
9. Require maintainer approval; publish only when the complete asset set and notes are ready.

Retain an approved, supported release for recovery. Never replace an already published version's binary with different bytes; issue a new version. A withdrawn release must not cause clients to downgrade.

Unsigned local packages remain development-only. Publishing must be explicit, not an incidental consequence of running a local packaging command with GitHub credentials in the environment.

The first updater-enabled release must be installed manually by existing users. An older app without updater code cannot acquire this feature automatically.

## 10. Failure and privacy requirements

| Condition | Required result |
| --- | --- |
| Offline, timeout, DNS, or proxy failure | Explain connection failure; offer retry; leave app usable |
| GitHub `401` | Request reconnection; do not loop on rejected credentials |
| GitHub `403` / `404` | Explain possible permissions, policy, or private repository visibility issue; distinguish rate limits where possible |
| Rate limit | Show when retry is available; respect GitHub response headers |
| No compatible published release | Explain that no compatible release is available |
| Missing/invalid metadata or artifact | Report incomplete release and keep installed version |
| Network interruption or cancellation | Do not install partial files; allow a clean retry |
| Insufficient disk space | Explain download/staging requirement and keep current installation |
| Bad checksum, signature, or publisher | Reject and remove the app-owned invalid cache artifact; never offer bypass |
| Unsaved edits / running work | Defer restart visibly |
| Endpoint policy or installer failure | Explain that installation was not confirmed; provide signed manual recovery |
| Relaunch still on old version | Show update failure/retry, not a success notice or automatic retry loop |

Update traffic sends only the GitHub credentials and request metadata necessary to authenticate and retrieve release information/assets. Do not send customer records, TPIDs, team data, MSX credentials, or portfolio contents. GitHub and its asset-delivery infrastructure necessarily receive ordinary network/request information.

Keep troubleshooting logs local and sanitized: installed/target version, update state, timings, error code, and HTTP status where useful. Redact tokens, authorization headers, device codes, and signed download URLs. No new telemetry service is introduced.

## 11. Proposed implementation boundaries

| Boundary | Proposed work |
| --- | --- |
| Main process | Update service and GitHub authorization service; updater events, credential storage, busy/install guard, version confirmation |
| Shared types/API | Typed update snapshot, errors, commands, and event subscription |
| Preload | Narrow bridge with event unsubscription; keep sandbox-compatible channel definitions consistent |
| IPC handlers | Validate sender and command/state transitions; never expose arbitrary installer execution |
| Renderer | Updates panel reused in Settings and setup/sign-in; progress, release details, and dirty-form coordination |
| Packaging | Explicit repo/publish configuration, trusted publisher, generated metadata, pinned updater dependency |
| CI/docs | Gated signed release workflow, updated release instructions, recovery instructions |

Suggested API capabilities: get update state, connect/cancel GitHub authorization, disconnect, check, download-and-restart, cancel download, restart a verified pending update, and subscribe/unsubscribe to state changes.

Main-process state is authoritative. Renderer commands cannot set state to verified/ready or bypass signature/busy checks.

External navigation is currently restricted to MSX. Add narrowly scoped GitHub verification and this repository's release-page actions; do not remove the existing general navigation restrictions.

## 12. Acceptance and validation

Documentation approval is not delivery acceptance. This feature is complete only after testing two real signed, installed Windows builds, N and N+1, against actual GitHub Release artifacts.

| ID | Acceptance criterion |
| --- | --- |
| A1 | An invited collaborator downloads N from the private release, installs, and launches without developer tools |
| A2 | GitHub App device authorization works for that collaborator with only intended repository permissions; no confidential app credential is packaged |
| A3 | Update access works before MSX sign-in, during first-run setup, and from Settings |
| A4 | N reports current when no newer eligible release exists; draft/prerelease/older/incompatible releases are not offered |
| A5 | After N+1 is published, N displays correct version, date, and release notes |
| A6 | **Update and restart** downloads, verifies, installs, and relaunches N+1 without a manually run installer |
| A7 | Accounts, team, PODs, history, review state, settings, vault readability, and MSX cache survive the upgrade |
| A8 | Busy work or unsaved forms defer restart; duplicate actions cannot cause concurrent installers |
| A9 | Cancel/offline/expired-token/rate-limit/incomplete-release/disk-full cases are visible and do not install partial artifacts |
| A10 | Tampered checksum, unsigned installer, and wrong publisher are rejected, including when a cached download is reused |
| A11 | Quitting with a downloaded update does not install it without the approved restart action |
| A12 | N+1 confirms success once; a failed handoff or old-version relaunch never reports success or loops |
| A13 | Clean-machine production packages contain no tokens, private keys, seeded portfolio data, or sensitive logs |
| A14 | Signature/publisher or metadata verification failure prevents release publication |
| A15 | Development/unpacked builds display unsupported installation state and cannot invoke the production installer |
| A16 | A signed manual reinstall recovers the app without deleting its existing local data |

Validation layers:

- Unit tests: semantic-version eligibility, state transitions, cancellation, error mapping, URL policy, and restart guards.
- Integration tests: GitHub device flow responses, private-provider auth/redirect handling, credential persistence, IPC events, stale callbacks, and verification failures.
- UI tests: available/current/error/progress states, accessibility, navigation during download, and signed-out access.
- Windows end-to-end tests: clean per-user install, real N-to-N+1 upgrade, preservation, cancellation, blocked restart, app closure, failed install/relaunch, and manual recovery.
- Existing regression checks: `npm test`, `npm run typecheck`, and `npm run build`.

Do not treat mocked updater tests as evidence that signed installation/relaunch works.

## 13. Delivery sequence and approval decisions

1. **Approve this PRD:** settle the recommendations below before changing application behavior.
2. **Prove feasibility:** collaborator GitHub App authorization, private artifact downloads with the selected updater, signing identity, and N-to-N+1 per-user NSIS upgrade.
3. **Implement release foundation:** signed/gated workflow, generated metadata, publisher consistency, and clean release artifacts.
4. **Implement product experience:** update service, authorization, typed IPC, Settings/setup UI, safe restart, and sanitized failures.
5. **Validate pilot:** run the acceptance matrix on managed Windows devices, document recovery, and publish the updater-enabled bootstrap release.

Decisions requested for approval:

| Decision | Recommendation |
| --- | --- |
| Download format | Signed Windows x64 per-user installer EXE, not portable EXE |
| Private authentication | Repository-restricted GitHub App with browser device authorization |
| Token expiry UX | Reauthorize when necessary; no embedded secret or unproven silent-renewal promise |
| Update policy | Manual check and explicit **Update and restart**; no automatic checks/download/install-on-quit |
| Pilot channel | Normal published releases in the private repository; no prerelease channel yet |
| Signing | Approved Artifact Signing publisher, consistent with updater verification; unsigned releases blocked |
| Recovery scope | Preserve data, schema-compatible releases, tested manual reinstall; no automatic rollback |

External prerequisites are GitHub App registration/installation, collaborator access, approved signing infrastructure, and a working Windows release environment. These are implementation gates, not assumed completed setup.

## 14. References

- [Parent PRD](PRD.md), especially sections 10.11, 12, 14, and 16.
- [Existing signing guidance](SIGNING.md).
- [electron-builder auto-update guidance](https://www.electron.build/docs/features/auto-update/).
- [electron-builder publishing guidance](https://www.electron.build/docs/publish/).
- [GitHub App user access tokens and device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).
- [GitHub release asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset).
- [GitHub personal access token limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

Platform references were reviewed on 11 November 2026. Package-specific behavior must be confirmed against pinned implementation versions.
