@echo off
rem ============================================================
rem  AI Agent Hub - local only (this PC)
rem  Keep ASCII-only: cmd.exe parses .cmd with the OEM codepage.
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py %*
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        python server.py %*
    ) else (
        echo [ERROR] Python not found. Install Python 3.9+ and enable "Add Python to PATH".
        echo Download: https://www.python.org/downloads/
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Server stopped.
pause