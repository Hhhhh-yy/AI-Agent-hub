# 备份与恢复

## 备份了什么

| 内容 | 是否包含 | 说明 |
|---|---|---|
| 网站全部代码（js / data / server.py / css） | ✅ | 可用于重装或换电脑 |
| `state/` 里的学习数据（进度、记忆、简历、关注清单） | ✅ | 你的学习痕迹 |
| 工作区根目录的 `*.md` 文档 | ✅ | 迁移评估、交接文件等 |
| `.agents/` 交接文件 | ✅ | |
| 截图 `_shots/` | ❌ | 太大（115MB），无备份价值 |
| `.git/` 版本历史 | ❌ | 云端已有 |
| **API Key** | ⚠️ **默认脱敏** | 见下 |

## 关于 API Key

默认备份会**清空 `apiKey` 和 `githubToken`**，避免备份文件被拷走时泄密。

恢复后需要重新填一次：打开网站 → 右上角「模型设置」→ 粘贴 Key → 保存。

如果你确定备份只放本机（不外传、不传网盘），想连 Key 一起备份：

```powershell
.\backup.ps1 -IncludeKey
```

## 三种触发方式

### 1. 自动（已配好）

**每天 22:00 自动备份**，任务名 `AgentHub-Backup`。

```powershell
# 查看任务
schtasks /Query /TN "AgentHub-Backup"

# 立即手动跑一次
schtasks /Run /TN "AgentHub-Backup"

# 改时间（例如改到 23:30）
schtasks /Delete /TN "AgentHub-Backup" /F
schtasks /Create /TN "AgentHub-Backup" /TR "powershell -NoProfile -WindowStyle Hidden -File \"C:\Users\Giraffe\Documents\deepseek-harness\default-workspace\ai-agent-hub\backup.ps1\"" /SC DAILY /ST 23:30 /F

# 取消自动备份
schtasks /Delete /TN "AgentHub-Backup" /F
```

### 2. 手动双击

```text
ai-agent-hub\backup.cmd
```

### 3. 命令行

```powershell
cd ai-agent-hub
.\backup.ps1                 # 默认保留 10 份
.\backup.ps1 -Keep 20        # 保留 20 份
.\backup.ps1 -IncludeKey     # 包含真实 Key
```

## 备份存到哪

```text
default-workspace\
└── backups\
    ├── workspace-20261020-142651.zip
    ├── workspace-20261021-220000.zip
    └── ...（自动轮转，默认只留最近 10 份）
```

每份约 **0.4 MB**（因为排除了截图），10 份也就 4 MB，不占空间。

## 怎么恢复

### 场景 A：网站代码被改坏 / 想回到某一版

优先用 Git（更精确）：

```powershell
cd ai-agent-hub
git log --oneline          # 看历史
git checkout <commit> -- .  # 回到某个版本
```

如果连 Git 也没了，就从 zip 解压：

```powershell
# 解压到临时目录
Expand-Archive backups\workspace-20261020-142651.zip -DestinationPath $env:TEMP\restore
# 把 ai-agent-hub 整个复制回来（保持目录结构）
```

### 场景 B：换电脑 / 重装系统

1. 把 `workspace-*.zip` 拷到新机器
2. 解压到 `C:\Users\<你的用户名>\Documents\deepseek-harness\default-workspace\`
3. **保持目录结构不变**（路径变了的话，对话历史会和工作区对不上）
4. 重新填 API Key
5. 双击 `start-lan.cmd` 启动

### 场景 C：只恢复学习数据（代码用 Git 是最新的）

```powershell
# 只解压 state 目录
Expand-Archive backups\workspace-xxx.zip -DestinationPath $env:TEMP\r
# 覆盖 state/
Copy-Item $env:TEMP\r\ai-agent-hub\state\* ai-agent-hub\state\ -Recurse -Force
```

## 注意

- **备份含个人学习数据**（进度、记忆、简历），不要上传到公开仓库或公开网盘
- 建议另存一份到**移动硬盘**，或放进你的私有网盘
- 如果 `backups/` 被 Git 忽略了（见 `.gitignore`），那是故意的——备份不该进版本库
