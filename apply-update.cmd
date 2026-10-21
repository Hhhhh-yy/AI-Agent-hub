@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo   AI Agent 学习中枢 - 一键更新
echo   更新前自动备份 state，更新后自动检查有没有人被覆盖
echo ============================================================
echo.

REM 关键：本脚本自己也是「未跟踪/已修改」的文件之一。
REM 如果用 git stash -u，会把它自己和 state_backup.py 一起收走，
REM 导致脚本跑到一半时自己的文件消失（cmd 报 "The batch file cannot be found"）。
REM 所以先把这两个工具文件 stage 起来，让 stash 不去动它们。
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
    REM 只用 -u 会连本脚本一起收走，所以这里只 stash 已跟踪文件的改动
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
echo [3/4] 从 GitHub 拉取最新代码...
git pull --rebase --autostash
if errorlevel 1 (
    echo.
    echo [错误] git pull 失败. 代码没更新, 进度和画像也没动
    echo        手动重试: git pull --rebase --autostash
    if defined STASHED git stash pop
    if /i not "%~1"=="--auto" pause
    exit /b 1
)
echo.

REM ---------- 4) 更新后：校验 state/ ----------
echo [4/4] 检查进度与画像是否完好...
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
