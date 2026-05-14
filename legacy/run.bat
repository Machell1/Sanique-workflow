@echo off
setlocal enabledelayedexpansion

title CLAW Installer & Launcher
color 0B
cls

echo.
echo    ============================================================
echo      CLAW - Commonwealth Legal Automation Workflow Platform
echo      Court of Appeal, Jamaica  ^|  Version 2.1.0
echo    ============================================================
echo.

:: ─── Check Node.js ───
node --version >nul 2>&1
if errorlevel 1 (
    echo    [NODE.JS REQUIRED]
    echo.
    echo    CLAW requires Node.js to run on your computer.
    echo.
    echo    Please install it from: https://nodejs.org/
    echo    ^(Download the LTS version for Windows^)
    echo.
    echo    After installing Node.js, close this window and
    echo    double-click run.bat again.
    echo.
    echo    Press any key to open the Node.js download page...
    pause >nul
    start https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo    [OK] Node.js %NODE_VER% found.

:: ─── Check npm ───
npm --version >nul 2>&1
if errorlevel 1 (
    echo    [ERROR] npm not found. Please reinstall Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm --version') do set NPM_VER=%%v
echo    [OK] npm %NPM_VER% found.

:: ─── Install Electron if needed ───
if not exist "node_modules\electron\package.json" (
    echo.
    echo    [INFO] First-time setup: Installing Electron...
    echo    This downloads ~180MB and takes 2-4 minutes.
    echo    --------------------------------------------------------
    call npm install electron@30.0.0 --no-save --legacy-peer-deps
    if errorlevel 1 (
        echo.
        echo    [ERROR] Failed to install Electron.
        echo    Please check your internet connection and try again.
        pause
        exit /b 1
    )
    echo    --------------------------------------------------------
    echo    [OK] Electron installed successfully.
) else (
    echo    [OK] Electron already installed.
)

:: ─── Create desktop shortcut ───
if not exist "%USERPROFILE%\Desktop\CLAW.lnk" (
    if exist "create-desktop-shortcut.js" (
        node create-desktop-shortcut.js >nul 2>&1
        echo    [OK] Desktop shortcut created.
    )
)

:: ─── Launch CLAW ───
echo.
echo    ============================================================
echo      Starting CLAW...
echo    ============================================================
echo.

node_modules\.bin\electron.cmd electron\main.cjs

if errorlevel 1 (
    echo.
    echo    [ERROR] CLAW exited unexpectedly.
    echo    Please check the error message above.
    pause
    exit /b 1
)

echo.
echo    CLAW has been closed.
pause
