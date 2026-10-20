# backup.ps1 · 工作区备份脚本
# 用法：
#   .\backup.ps1                 # 默认：脱敏 API Key
#   .\backup.ps1 -IncludeKey     # 包含真实 Key（仅限本机离线备份）
#   .\backup.ps1 -Keep 20        # 保留最近 20 份（默认 10）
param(
    [switch]$IncludeKey,
    [int]$Keep = 10
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ws = Split-Path -Parent $scriptDir          # default-workspace
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $ws "backups"
$tmp = Join-Path $env:TEMP ("hub-backup-" + $stamp)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  工作区备份" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  来源：$ws"
Write-Host "  目标：$backupRoot"

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# ---------- 1) 复制 ai-agent-hub（排除截图/缓存/临时文件）----------
$hub = Join-Path $scriptDir ""
$dstHub = Join-Path $tmp "ai-agent-hub"
New-Item -ItemType Directory -Force -Path $dstHub | Out-Null

$excludeDirs = @("_shots", "__pycache__", ".git", "node_modules")
$excludeFiles = @("*.pyc", "*.tmp", "_*.py", "_*.js", "_*.log")

Get-ChildItem $hub -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $rel = $_.FullName.Substring($hub.Length).TrimStart('\')
        $parts = $rel -split '\\'
        $skip = $false
        foreach ($d in $excludeDirs) { if ($parts -contains $d) { $skip = $true; break } }
        if (-not $skip) {
            foreach ($pat in $excludeFiles) { if ($_.Name -like $pat) { $skip = $true; break } }
        }
        -not $skip
    } |
    ForEach-Object {
        $rel = $_.FullName.Substring($hub.Length).TrimStart('\')
        $target = Join-Path $dstHub $rel
        $dir = Split-Path -Parent $target
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Copy-Item $_.FullName $target -Force
    }

# ---------- 2) 复制工作区根目录的文档与交接文件 ----------
foreach ($pat in @("*.md")) {
    Get-ChildItem (Join-Path $ws $pat) -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $tmp $_.Name) -Force
    }
}
$agents = Join-Path $ws ".agents"
if (Test-Path $agents) {
    Copy-Item $agents (Join-Path $tmp ".agents") -Recurse -Force
}

# ---------- 3) 脱敏 settings.json ----------
$settingsPath = Join-Path $dstHub "state\settings.json"
$keyNote = "未脱敏（备份包含真实 API Key，请勿外传）"
if ((Test-Path $settingsPath) -and (-not $IncludeKey)) {
    try {
        $cfg = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.PSObject.Properties.Name -contains "apiKey") {
            $cfg.apiKey = ""
        }
        if ($cfg.PSObject.Properties.Name -contains "githubToken") {
            $cfg.githubToken = ""
        }
        $cfg | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
        $keyNote = "已脱敏（apiKey 与 githubToken 已清空，恢复后需重新填写）"
        Write-Host "  ✓ API Key 已脱敏" -ForegroundColor Yellow
    } catch {
        Write-Host "  ⚠ 脱敏失败，保留原文件：$($_.Exception.Message)" -ForegroundColor Yellow
        $keyNote = "脱敏失败，可能包含真实 Key"
    }
} elseif ($IncludeKey) {
    $keyNote = "未脱敏（-IncludeKey：备份包含真实 API Key，请勿外传）"
}

# ---------- 4) 写一份备份说明 ----------
$readme = @"
# 备份说明

- 备份时间：$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- 来源目录：$ws
- 内容：
  - ai-agent-hub/（代码 + state 数据，排除截图与缓存）
  - 工作区根目录的 *.md 文档
  - .agents/ 交接文件
- API Key 状态：$keyNote

## 恢复方法

1. 解压到原路径（保持目录结构）
2. 如果 Key 已脱敏，打开网站 → 右上角「模型设置」重新填一次
3. 若成员数据需要恢复，覆盖 state/ 目录即可（网站会重新读取）

## 注意

- 本备份含个人学习数据（进度、记忆、简历），**不要上传到公开仓库**
- 建议只放在本机或移动硬盘
"@
Set-Content (Join-Path $tmp "备份说明.md") $readme -Encoding UTF8

# ---------- 5) 打包 ----------
$zip = Join-Path $backupRoot ("workspace-" + $stamp + ".zip")
Write-Host "  正在打包..." -ForegroundColor Gray
Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zip -CompressionLevel Optimal -Force
Remove-Item $tmp -Recurse -Force

$sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ""
Write-Host "  ✓ 备份完成：$zip" -ForegroundColor Green
Write-Host "    大小：$sizeMB MB" -ForegroundColor Green

# ---------- 6) 轮转：只留最近 N 份 ----------
$all = Get-ChildItem $backupRoot -Filter "workspace-*.zip" | Sort-Object LastWriteTime -Descending
if ($all.Count -gt $Keep) {
    $all | Select-Object -Skip $Keep | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "    - 已清理旧备份：$($_.Name)" -ForegroundColor DarkGray
    }
}
$remain = (Get-ChildItem $backupRoot -Filter "workspace-*.zip" | Measure-Object).Count
Write-Host "    当前保留 $remain 份（上限 $Keep）" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
