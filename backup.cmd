@echo off
rem ============================================================
rem  Backup the learning hub workspace into a timestamped zip
rem  Output: ..\backups\workspace-YYYYMMDD-HHMMSS.zip
rem  Keep ASCII-only: cmd.exe parses .cmd with the OEM codepage.
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Backing up the AI Agent learning hub
echo ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" %*
set RC=%errorlevel%

echo.
if %RC%==0 (
    echo Backup finished. See the folder: ..\backups\
) else (
    echo Backup FAILED with code %RC%. Check the message above.
)

pause
