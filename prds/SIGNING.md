# Signing and releasing MCAPS Console

Production installers must be signed with an approved organization identity. A self-signed development certificate does not provide a trustworthy SmartScreen or enterprise deployment experience.

## Prerequisites

1. Create or obtain access to an Azure Artifact Signing account and Public Trust certificate profile.
2. Assign the signing identity the `Trusted Signing Certificate Profile Signer` role.
3. Install the Artifact Signing client tools:

```powershell
winget install -e --id Microsoft.Azure.ArtifactSigningClientTools
```

4. Authenticate with an identity authorized to use the certificate profile. For local release work this can be `az login`. CI should use a short-lived workload identity.

## Build and sign

```powershell
npm ci
npm test
$env:ARTIFACT_SIGNING_ENDPOINT = "https://<region>.codesigning.azure.net/"
$env:ARTIFACT_SIGNING_ACCOUNT = "<account>"
$env:ARTIFACT_SIGNING_PROFILE = "<profile>"
$env:ARTIFACT_SIGNING_PUBLISHER = "<verified publisher subject>"
npm run package:signed
npm run verify:release
npm run checksums
```

The signed electron-builder configuration applies Artifact Signing while packaging so both the installed application executable and the outer installer are signed. The normal `npm run package` command intentionally creates an unsigned development build. Do not publish that build to peer managers.

## Release contents

Publish these files from `release`:

- Signed `MCAPS-Console-Setup-<version>.exe`
- Byte-identical `CSU-Console-Setup-<version>.exe` compatibility alias for existing updater clients
- Generated `latest.yml` (required for in-app updates)
- `MCAPS-Console-Setup-<version>.exe.blockmap` when update tooling needs it
- `SHA256SUMS.txt`
- Release notes and known issues
- Third-party notices and SBOM

Verify the signature before publishing:

```powershell
Get-AuthenticodeSignature .\release\MCAPS-Console-Setup-0.5.0.exe |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

The status must be `Valid`, and the signer subject must match the approved publisher.

Signing helps Windows identify the publisher and allows reputation to build. A newly signed application may still show a SmartScreen warning during its initial distribution period.

## Public release workflow

The public release source is <https://github.com/MoimHossain/msxpert/releases>.
Users do not need GitHub credentials. The app never receives the CI publishing identity.

Before creating a release, configure GitHub environments:

- `release-signing`: approval/protected-tag rules and variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `ARTIFACT_SIGNING_ENDPOINT`, `ARTIFACT_SIGNING_ACCOUNT`, `ARTIFACT_SIGNING_PROFILE`, and `ARTIFACT_SIGNING_PUBLISHER`.
- `release-publish`: required maintainer review before creating the draft release.

Configure Azure workload federation for the repository's `release-signing` environment, with permission to sign using the approved certificate profile. `ARTIFACT_SIGNING_PUBLISHER` must be the full certificate subject, beginning with `CN=`, exactly as returned by `Get-AuthenticodeSignature`. It controls both generated updater trust and the app's additional fail-closed verification.

Create and push an immutable `v<version>` tag matching the stable version in `package.json`. The workflow runs regression tests, production dependency audit, a production build, signing, UI smoke tests, publisher/version/metadata verification, SBOM, and checksums. Packaging commands explicitly disable publishing. A separate job with repository write permission creates a **draft** release; it never publishes automatically.

Before publishing the draft:

1. Review all public assets and notes for secrets and customer information. Enable repository secret scanning and any organization-required malware/dependency checks; these are additional release gates, not guarantees made by packaging.
2. Verify clean per-user installation on a managed Windows 11 x64 device.
3. Exercise an actual signed N-to-N+1 update, including data retention, unsaved edits, in-flight work, interrupted downloads, normal app closure, and failed-install recovery. The automated UI smoke uses mocked release responses and does not replace this test.
4. Confirm the installer, `latest.yml`, blockmap if present, checksums, notices, SBOM, and migration/known-issue notes are complete.
5. Publish as a normal release, not a prerelease, and make the highest supported stable version GitHub's latest release.

Do not overwrite published installer bytes or edit generated checksums. Issue a new version. The first updater-enabled release must be installed manually by existing users.

## Update and recovery behavior

The signed installed Windows x64 app exposes **Settings > Updates**, with the same panel available through **App updates** during sign-in/setup. Updates are manual: **Check for updates**, then **Update and restart**. Downloading does not install on normal quit. Unsaved scope/retention/team/POD edits, customer onboarding previews, and running application requests defer restart.

Only signed production packages carry approved publisher metadata. Development/unpacked/unsigned packages show that in-app installation is unavailable. Every installation attempt rechecks the full installer checksum, approved Authenticode publisher, and embedded product version, including cached downloads.

Keep the application ID, per-user installation scope, and `%LOCALAPPDATA%\CSU Console` stable. This increment does not change the portfolio-data schema. Schema-incompatible future releases require separately tested backup/migration recovery before publication.

The visible product and installed executable are now `MCAPS Console` / `MCAPS Console.exe`. The legacy data/profile directory and internal application/package/cache identities intentionally remain unchanged. Packaging runs `prepare:updates` to copy the primary installer to its legacy filename and update the manifest without changing installer bytes, SHA-512, or signature. Publish both names so pre-rename alpha clients can upgrade.

If installation fails, download and run the current supported signed installer from Releases. **Do not delete `%LOCALAPPDATA%\CSU Console`**, `portfolio.db`, `vault-key.json`, or the protected MSAL cache. This is manual repair, not automatic rollback; do not install an older binary against an incompatible newer data schema.

## Temporary unsigned alpha pilot

The maintainer approved an unsigned, updater-enabled test pilot on 11 November 2026 while public-trust signing is deferred. This is an explicit exception for testing, not a weakening of production builds.

Use a version of the form `<major>.<minor>.<patch>-alpha.<number>` and `npm run package:test`. The dedicated `electron-builder.test.cjs` embeds `updateMode: "unsigned-test"`, disables publisher verification only for that package, and generates `alpha.yml`. Normal builds do not enable this mode through environment variables or renderer settings. Stable production releases still require the approved publisher.

Publish these builds as GitHub **prereleases**, clearly labeled **UNSIGNED TEST**, with installer, blockmap, `alpha.yml`, and SHA-256 checksums. Never mark them as the latest stable production release. The signed release workflow skips prerelease tags.

Test-mode clients only offer newer numbered `alpha` versions. They validate installer checksum and embedded product version, but cannot establish a trusted publisher. The app displays this limitation in Settings and its title bar. GitHub/TLS delivery and checksums are not a replacement for publisher authentication.

For the first test pair, install `0.4.0-alpha.1`, then check for updates to `0.4.0-alpha.2`. Both releases contain the same feature code; the second version exists to exercise discovery, download, safe restart, and upgrade. Operating-system/endpoint security may block unsigned software; the app does not bypass those policies.

Before moving to production, install a signed stable release manually and retire the unsigned alpha channel.
