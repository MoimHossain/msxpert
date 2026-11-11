[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$package = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$publisher = $env:ARTIFACT_SIGNING_PUBLISHER
if (-not $publisher -or -not $publisher.StartsWith("CN=")) {
    throw "Set ARTIFACT_SIGNING_PUBLISHER to the full approved certificate subject."
}

$installerName = "MCAPS-Console-Setup-$($package.version).exe"
$installer = Join-Path $release $installerName
$mainExe = Join-Path $release "win-unpacked\MCAPS Console.exe"
foreach ($file in @($installer, $mainExe)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -cne $publisher) {
        throw "Invalid signature or unexpected publisher: $file"
    }
    if (-not $signature.TimeStamperCertificate) {
        throw "Missing trusted timestamp: $file"
    }
    $actualVersion = (Get-Item -LiteralPath $file).VersionInfo.ProductVersion
    if ($actualVersion -ne $package.version -and $actualVersion -ne "$($package.version).0") {
        throw "Version mismatch in $file"
    }
}

$env:CSU_VERIFY_PUBLISHER = $publisher
try {
    @'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const yaml = require("js-yaml");
const { execFileSync } = require("node:child_process");
const pkg = require(path.join(process.cwd(), "package.json"));
const release = path.join(process.cwd(), "release");
const primary = `MCAPS-Console-Setup-${pkg.version}.exe`;
const expected = `CSU-Console-Setup-${pkg.version}.exe`;
const metadata = yaml.load(fs.readFileSync(path.join(release, "latest.yml"), "utf8"));
const config = yaml.load(fs.readFileSync(path.join(release, "win-unpacked", "resources", "app-update.yml"), "utf8"));
if (metadata.version !== pkg.version || metadata.files?.length !== 1) throw Error("Invalid update metadata");
const file = metadata.files[0];
const bytes = fs.readFileSync(path.join(release, expected));
if (!bytes.equals(fs.readFileSync(path.join(release, primary)))) throw Error("Legacy update alias differs from the signed MCAPS installer");
if (file.url !== expected || file.size !== bytes.length ||
    file.sha512 !== crypto.createHash("sha512").update(bytes).digest("base64")) {
  throw Error("Installer metadata/checksum mismatch");
}
if (config.provider !== "github" || config.owner !== "MoimHossain" || config.repo !== "msxpert" || config.private === true) {
  throw Error("Unexpected update feed");
}
const publishers = Array.isArray(config.publisherName) ? config.publisherName : [config.publisherName];
if (publishers.length !== 1 || publishers[0] !== process.env.CSU_VERIFY_PUBLISHER) throw Error("Updater publisher mismatch");
if (JSON.stringify(config).match(/"(token|authorization|password|secret)"\s*:/i)) throw Error("Credential in update config");
const asar = path.join(release, "win-unpacked", "resources", "app.asar");
const packaged = JSON.parse(execFileSync(process.execPath, [
  "-e", "process.stdout.write(require('@electron/asar').extractFile(process.argv[1], 'package.json'))", asar
], { encoding: "utf8" }));
if (packaged.updatePublisher !== process.env.CSU_VERIFY_PUBLISHER) throw Error("Packaged trust mismatch");
console.log(`Verified signed release ${pkg.version}, publisher, feed, and SHA-512 metadata.`);
'@ | node -
    if ($LASTEXITCODE -ne 0) { throw "Release metadata verification failed." }
} finally {
    Remove-Item Env:\CSU_VERIFY_PUBLISHER -ErrorAction SilentlyContinue
}
