@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo   AI Agent 学习中枢 - 一键更新
echo   更新前自动备份 state，更新后自动检查有没有人被覆盖
echo ============================================================
echo.

REM this script is also an untracked/modified file
REM git stash -u would stash this script itself
REM causing 'The batch file cannot be found' mid-run
REM so stage these tool files first
git add apply-update.cmd state_backup.py UPDATE.md >nul 2>nul

where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 找不到 python, 请确认已安装 Python 并加入 PATH
    if /i not "%~1"=="--auto" pause
    exit /b 1
)

REM ---------- 1) 更新前：备份 state/ ----------
echo [1/4] 备份当前进度与画像...
set "SNAP="
for /f "usebackq delims=" %%i in (`python state_backup.py snapshot --tag pre-update --name-only`) do set "SNAP=%%i"
if "!SNAP!"=="" (
    echo [错误] 备份失败, 已中止更新. 数据比新功能重要
    if /i not "%~1"=="--auto" pause
    exit /b 1
)
echo       快照：!SNAP!
echo.

REM ---------- 2) 检查工作区是否干净 ----------
echo [2/4] 检查本地改动...
set "DIRTY="
for /f "delims=" %%s in ('git status --porcelain --untracked-files=no') do set "DIRTY=1"
if defined DIRTY (
    echo       有未提交的改动, 会先 stash, 更新后还原:
    git status --short --untracked-files=no
    REM no -u: it would stash this script too
    git stash push -m "auto-stash-before-update-!SNAP!"
    if errorlevel 1 (
        echo [错误] stash 失败，已中止。
        if /i not "%~1"=="--auto" pause
        exit /b 1
    )
    set "STASHED=1"
) else (
    echo       工作区干净，直接更新。
)
echo.

REM ---------- 3) 拉取代码 ----------
REM record server.py hash before pull
REM restart only if server.py changed
set "OLD_SRV="
set "NEW_SRV="
for /f "delims=" %%h in ('git rev-parse HEAD:server.py 2^>nul') do set "OLD_SRV=%%h"
echo [3/5] 从 GitHub 拉取最新代码...
git pull --rebase --autostash
if errorlevel 1 (
    echo.
    echo [错误] git pull 失败. 代码没更新, 进度和画像也没动
    echo        手动重试: git pull --rebase --autostash
    if defined STASHED git stash pop
    if /i not "%~1"=="--auto" pause
    exit /b 1
)
for /f "delims=" %%h in ('git rev-parse HEAD:server.py 2^>nul') do set "NEW_SRV=%%h"
echo.

REM ---------- 4) 更新后：校验 state/ ----------
echo [4/5] 检查进度与画像是否完好...
python state_backup.py guard --before "!SNAP!"
if errorlevel 1 (
    echo.
    echo [注意] 已自动还原你更新前的所有进度和画像
    echo        请把上面的输出发给 DSH，让 AI 看一眼是哪里覆盖了 state/。
    if /i not "%~1"=="--auto" pause
    exit /b 1
)

if defined STASHED (
    echo.
    echo 还原之前未提交的改动...
    git stash pop
)

REM ---------- 5) 后端变了才重启服务 ----------
echo.
echo [5/5] 检查是否需要重启服务...
set "NEED_RESTART="
if /i not "!OLD_SRV!"=="!NEW_SRV!" set "NEED_RESTART=1"
if not defined OLD_SRV if not defined NEW_SRV set "NEED_RESTART="

if not defined NEED_RESTART (
    echo       本次只改了前端文件, 不用重启.
    echo       你和她各按一次 Ctrl+F5 就能看到新版.
    goto :done
)

echo       server.py 有改动, 需要重启服务才生效.
python restart_server.py
if errorlevel 1 (
    echo.
    echo [警告] 自动重启失败. 代码已更新, 但新后端还没生效.
    echo        请手动执行:
    echo          python restart_server.py
    if /i not "%~1"=="--auto" pause
    exit /b 1
)

:done
echo.
echo ============================================================
echo   更新完成，进度与画像全部完好
echo   同学那边不用做任何操作，刷新页面即可
echo ============================================================
echo.
echo 本次快照：!SNAP!
echo 手工还原：python state_backup.py restore --name !SNAP!
echo.
if /i not "%~1"=="--auto" pause
