# Signing and releasing CSU Console

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
npm run checksums
```

The signed electron-builder configuration applies Artifact Signing while packaging so both the installed application executable and the outer installer are signed. The normal `npm run package` command intentionally creates an unsigned development build. Do not publish that build to peer managers.

## Release contents

Publish these files from `release`:

- Signed `CSU-Console-Setup-0.1.0.exe`
- `CSU-Console-Setup-0.1.0.exe.blockmap` when update tooling needs it
- `SHA256SUMS.txt`
- Release notes and known issues

Verify the signature before publishing:

```powershell
Get-AuthenticodeSignature .\release\CSU-Console-Setup-0.1.0.exe |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

The status must be `Valid`, and the signer subject must match the approved publisher.

Signing helps Windows identify the publisher and allows reputation to build. A newly signed application may still show a SmartScreen warning during its initial distribution period.
