@echo off
rem ============================================================
rem  Start the hub in LAN sharing mode, hidden (no console window).
rem  Log: state\server.log
rem  Manual start only - NOT registered to run at boot.
rem  NOTE: keep this file ASCII-only. cmd.exe parses .cmd files
rem  using the OEM codepage, so non-ASCII comments break parsing.
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem Skip if the port is already listening (avoid double start)
netstat -an | findstr /C:":8787 " | findstr LISTENING >nul 2>nul
if %errorlevel%==0 (
    echo [%date% %time%] already running, skip.>> "state\server.log"
    exit /b 0
)

echo. >> "state\server.log"
echo [%date% %time%] starting hub (LAN mode) ... >> "state\server.log"

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py --lan >> "state\server.log" 2>&1
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        python server.py --lan >> "state\server.log" 2>&1
    ) else (
        echo [%date% %time%] ERROR: python not found.>> "state\server.log"
    )
)
echo [%date% %time%] hub stopped.>> "state\server.log"