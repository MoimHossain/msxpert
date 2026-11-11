[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$output = Join-Path $release "SHA256SUMS.txt"

$files = Get-ChildItem -LiteralPath $release -File |
    Where-Object { $_.Name -ne "SHA256SUMS.txt" -and $_.Extension -ne ".yml" } |
    Sort-Object Name

if (-not $files) {
    throw "No release artifacts were found in $release."
}

$lines = foreach ($file in $files) {
    $stream = [System.IO.File]::OpenRead($file.FullName)
    try {
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hash = $algorithm.ComputeHash($stream)
            $hex = [System.BitConverter]::ToString($hash).Replace("-", "").ToLowerInvariant()
            "$hex  $($file.Name)"
        } finally {
            $algorithm.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

[System.IO.File]::WriteAllLines($output, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "Wrote $output"
