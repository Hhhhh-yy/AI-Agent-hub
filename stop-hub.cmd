@echo off
rem ============================================================
rem  Stop the hub server (the process listening on port 8787).
rem  Keep ASCII-only: cmd.exe parses .cmd with the OEM codepage.
rem ============================================================
chcp 65001 >nul
setlocal enabledelayedexpansion

set PORT=%~1
if "%PORT%"=="" set PORT=8787

echo Looking for the process listening on port %PORT% ...
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    echo Killing PID %%p ...
    taskkill /PID %%p /F >nul 2>nul
    if !errorlevel!==0 (set FOUND=1) else (echo   failed, maybe need administrator rights.)
)

if "!FOUND!"=="1" (
    echo Done. The hub has been stopped.
) else (
    echo Nothing found on port %PORT% - the hub is probably not running.
)
echo.
pause