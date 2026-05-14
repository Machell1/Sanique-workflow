# CLAW - Commonwealth Legal Automation Workflow Platform
# Windows Installation Script (PowerShell)
# Court of Appeal, Jamaica

$Host.UI.RawUI.WindowTitle = "CLAW Installer"

function Write-Header {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  CLAW - Commonwealth Legal Automation Workflow Platform" -ForegroundColor Cyan
    Write-Host "  Court of Appeal, Jamaica  |  Version 2.1.0" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Test-NodeJS {
    try {
        $ver = node --version 2>$null
        return $ver.Trim()
    } catch {
        return $null
    }
}

function Install-Electron {
    Write-Host "[INFO] Installing Electron..." -ForegroundColor Yellow
    Write-Host "This downloads ~180MB and takes 2-4 minutes." -ForegroundColor Gray
    Write-Host "------------------------------------------------------------" -ForegroundColor Gray

    npm install electron@30.0.0 --no-save --legacy-peer-deps 2>&1 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install Electron." -ForegroundColor Red
        return $false
    }
    Write-Host "[OK] Electron installed." -ForegroundColor Green
    return $true
}

function New-DesktopShortcut {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktop "CLAW.lnk"
    $appDir = $PSScriptRoot

    $WshShell = New-Object -ComObject WScript.Shell
    $shortcut = $WshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $appDir "run.bat"
    $shortcut.WorkingDirectory = $appDir
    $shortcut.Description = "CLAW - Commonwealth Legal Automation Workflow"
    $shortcut.IconLocation = Join-Path $appDir "dist\claw-logo.svg"
    $shortcut.WindowStyle = 1
    $shortcut.Save()

    Write-Host "[OK] Desktop shortcut created." -ForegroundColor Green
}

# ─── Main ───
Write-Header

# Check Node.js
$nodeVer = Test-NodeJS
if (-not $nodeVer) {
    Write-Host "[NODE.JS REQUIRED]" -ForegroundColor Red
    Write-Host ""
    Write-Host "CLAW requires Node.js to run on your computer." -ForegroundColor White
    Write-Host "Please install it from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "(Download the LTS version for Windows)"
    Write-Host ""
    $openBrowser = Read-Host "Press Enter to open the download page, or type 'skip' to cancel"
    if ($openBrowser -ne 'skip') {
        Start-Process "https://nodejs.org/"
    }
    exit 1
}
Write-Host "[OK] Node.js $nodeVer found." -ForegroundColor Green

# Check Electron
if (-not (Test-Path "node_modules\electron\package.json")) {
    $result = Install-Electron
    if (-not $result) { exit 1 }
} else {
    Write-Host "[OK] Electron already installed." -ForegroundColor Green
}

# Create desktop shortcut
if (-not (Test-Path "$env:USERPROFILE\Desktop\CLAW.lnk")) {
    New-DesktopShortcut
}

# Launch CLAW
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting CLAW..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

& "node_modules\.bin\electron.cmd" "electron\main.cjs"
