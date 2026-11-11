[CmdletBinding()]
param([string]$Directory)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Directory) { $Directory = Join-Path $root "release" }
$Directory = (Resolve-Path -LiteralPath $Directory).Path
$version = (Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(-alpha\.\d+)?$') {
    throw "Unsupported update channel: $version"
}
$primary = "MCAPS-Console-Setup-$version.exe"
$legacy = "CSU-Console-Setup-$version.exe"
$channel = if ($version -match '-alpha\.') { "alpha.yml" } else { "latest.yml" }
$metadataPath = Join-Path $Directory $channel
$metadata = Get-Content -LiteralPath $metadataPath -Raw
if (-not $metadata.Contains($primary) -and -not $metadata.Contains($legacy)) {
    throw "The update manifest does not reference the expected installer."
}

# Existing CSU alpha clients require this filename; the executable inside is MCAPS.
Copy-Item -LiteralPath (Join-Path $Directory $primary) -Destination (Join-Path $Directory $legacy) -Force
[IO.File]::WriteAllText($metadataPath, $metadata.Replace($primary, $legacy), [Text.UTF8Encoding]::new($false))
Write-Output "Prepared MCAPS installer and byte-identical legacy update alias in $Directory."
