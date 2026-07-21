# Export open-eligible LiteLoader body for upstream / public mirror.
# Does NOT include runtime/, release/, AGENTS.md, or inject tooling.
#
# Usage:
#   .\scripts\export-open-src.ps1
#   .\scripts\export-open-src.ps1 -OutDir D:\tmp\ll-open
#   .\scripts\export-open-src.ps1 -WhatIf

param(
    [string]$OutDir = "",
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $OutDir) {
    $OutDir = Join-Path $Repo "dist\open-liteloader"
}

$allowFile = Join-Path $Repo "scripts\open-allowlist.txt"
$denyFile = Join-Path $Repo "scripts\open-denylist.txt"

function Read-List([string]$path) {
    if (-not (Test-Path $path)) { return @() }
    Get-Content $path | ForEach-Object {
        $t = $_.Trim()
        if (-not $t -or $t.StartsWith("#")) { return }
        $t.Replace("/", [IO.Path]::DirectorySeparatorChar)
    }
}

$allow = Read-List $allowFile
$deny = Read-List $denyFile

function Test-Denied([string]$rel) {
    # Match only full path segments / exact files — NOT substrings.
    # Bug fixed: deny "runtime/" must not exclude src/main/runtime.js
    $norm = $rel.Replace("/", "\").TrimStart("\").ToLowerInvariant()
    foreach ($d in $deny) {
        $raw = $d.Replace("/", "\").Trim().ToLowerInvariant()
        if (-not $raw) { continue }
        $dd = $raw.TrimEnd("\")
        if (-not $dd) { continue }
        # Exact file or directory name at repo root
        if ($norm -eq $dd) { return $true }
        # Directory / prefix only at segment boundary (runtime\foo, not …\runtime.js)
        if ($norm.StartsWith($dd + "\")) { return $true }
    }
    return $false
}

function Get-AllowedFiles {
    $files = New-Object System.Collections.Generic.List[string]
    foreach ($a in $allow) {
        $src = Join-Path $Repo $a
        if (Test-Path $src -PathType Container) {
            Get-ChildItem $src -Recurse -File | ForEach-Object {
                $rel = $_.FullName.Substring($Repo.Length).TrimStart("\", "/")
                if (-not (Test-Denied $rel)) { $files.Add($rel) }
            }
        } elseif (Test-Path $src -PathType Leaf) {
            $rel = $a
            if (-not (Test-Denied $rel)) { $files.Add($rel) }
        } else {
            Write-Warning "allowlist miss: $a"
        }
    }
    return $files | Select-Object -Unique
}

$list = @(Get-AllowedFiles)
Write-Host "Open export: $($list.Count) files -> $OutDir"

# Sanity: forbidden patterns inside exported src
$forbidden = @("OiCkilL.LiteLoaderQQNT", "ModeB.preloadLog", "LLRuntime_arm", "CreateRemoteThread")
$hits = @()
foreach ($rel in $list) {
    if ($rel -notmatch '\.(js|ts|json|md|html|css|sh)$') { continue }
    $text = Get-Content (Join-Path $Repo $rel) -Raw -ErrorAction SilentlyContinue
    if (-not $text) { continue }
    foreach ($f in $forbidden) {
        if ($text.Contains($f)) {
            $hits += "${rel}: contains '$f'"
        }
    }
}
if ($hits.Count) {
    Write-Host "WARN: possible private markers in open files:" -ForegroundColor Yellow
    $hits | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host "Fix before upstream PR (comments about private packaging are OK if not hard-coded product defaults)." -ForegroundColor Yellow
}

if ($WhatIf) {
    $list | ForEach-Object { Write-Host "  $_" }
    return
}

if (Test-Path $OutDir) {
    Remove-Item -Recurse -Force $OutDir
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

foreach ($rel in $list) {
    $from = Join-Path $Repo $rel
    $to = Join-Path $OutDir $rel
    $dir = Split-Path $to -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Copy-Item -Force -LiteralPath $from -Destination $to
}

# Stamp
@"
# Open LiteLoader export
Generated: $(Get-Date -Format o)
Source: $Repo
File count: $($list.Count)
See docs/OPEN_SYNC.md
"@ | Set-Content (Join-Path $OutDir "OPEN_EXPORT.txt") -Encoding UTF8

Write-Host "OK wrote $OutDir"
Write-Host "Next: copy into upstream clone and open PR, or push to public mirror."
