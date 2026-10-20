@echo off
rem ============================================================
rem  Install a daily backup task (default 22:00) via Task Scheduler
rem  Run this file once. To remove: schtasks /Delete /TN "AgentHub-Backup" /F
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set TASK_NAME=AgentHub-Backup
set RUN_TIME=%~1
if "%RUN_TIME%"=="" set RUN_TIME=22:00

echo ============================================================
echo   Install daily backup task
echo   Task name : %TASK_NAME%
echo   Run time  : every day at %RUN_TIME%
echo ============================================================
echo.

schtasks /Query /TN "%TASK_NAME%" >nul 2>nul
if %errorlevel%==0 (
    echo Task already exists. Replacing it...
    schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul
)

schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0backup.ps1\"" ^
  /SC DAILY ^
  /ST %RUN_TIME% ^
  /F

if %errorlevel%==0 (
    echo.
    echo [OK] Daily backup installed. It will run at %RUN_TIME% every day.
    echo      Backups go to: ..\backups\
    echo      To check:  schtasks /Query /TN "%TASK_NAME%"
    echo      To remove: schtasks /Delete /TN "%TASK_NAME%" /F
) else (
    echo.
    echo [FAILED] Could not create the task. Try running this file as administrator.
)

echo.
pause
