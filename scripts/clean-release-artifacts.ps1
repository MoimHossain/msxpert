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
        $_.Name -match '^CSU-Console-Setup-\d+\.\d+\.\d+\.exe(\.blockmap)?$' -or
        $_.Name -eq "SHA256SUMS.txt"
    } |
    Remove-Item -Force
