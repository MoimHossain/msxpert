[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"

if (-not (Test-Path -LiteralPath $release)) {
    return
}

Get-ChildItem -LiteralPath $release -File |
    Where-Object {
        $_.Name -match '^CSU-Console-Setup-\d+\.\d+\.\d+(-alpha\.\d+)?\.exe(\.blockmap)?$' -or
        $_.Name -in @("SHA256SUMS.txt", "latest.yml", "alpha.yml", "SBOM.cdx.json", "THIRD-PARTY-NOTICES.md")
    } |
    Remove-Item -Force
