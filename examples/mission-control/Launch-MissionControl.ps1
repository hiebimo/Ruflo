#Requires -Version 5.1
<#
.SYNOPSIS
    OpenClaw Mission Control launcher — fixed Split-Path error.

.NOTES
    Fix: Use $PSScriptRoot instead of $MyInvocation.MyCommand.Path.
    $PSScriptRoot is always set when a .ps1 file is executed directly.
    $MyInvocation.MyCommand.Path is null when the script is piped or
    dot-sourced interactively, which causes the ParameterBindingValidation error.
#>

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║                                          ║" -ForegroundColor Green
Write-Host "  ║     OPENCLAW — MISSION CONTROL  v1.0     ║" -ForegroundColor Green
Write-Host "  ║                                          ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# ── Resolve script directory robustly ──
# $PSScriptRoot  → set whenever a .ps1 file is run directly (preferred)
# Fallback       → current working directory (interactive / pipe fallback)
if ($PSScriptRoot) {
    $scriptDir = $PSScriptRoot
} else {
    $scriptDir = (Get-Location).Path
    Write-Host "  [WARN] PSScriptRoot is empty — using working directory: $scriptDir" -ForegroundColor Yellow
    Write-Host "         Tip: save this file and run it as .\Launch-MissionControl.ps1" -ForegroundColor Yellow
    Write-Host ""
}

$dashboardFile = Join-Path $scriptDir "OpenClaw-MissionControl.html"

Write-Host "  [*] Launching dashboard..." -ForegroundColor Cyan
Write-Host "  [*] File: $dashboardFile" -ForegroundColor Cyan

if (-Not (Test-Path $dashboardFile)) {
    Write-Host ""
    Write-Host "  [ERROR] Dashboard file not found:" -ForegroundColor Red
    Write-Host "          $dashboardFile" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Make sure OpenClaw-MissionControl.html is in the same folder as" -ForegroundColor Yellow
    Write-Host "  this script, or update the path above." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

Start-Process $dashboardFile

Write-Host ""
Write-Host "  [OK] Dashboard opened in your default browser!" -ForegroundColor Green
Write-Host "  Tip: Keep this terminal open while using the dashboard." -ForegroundColor DarkGray
Write-Host ""
Read-Host "  Press Enter to exit"
