# 更新网站时，怎么保证「冉冉」的进度和画像不丢

## 一句话结论

她的数据在这台电脑的 `state/users/u2/` 里（不是在她电脑上）。
`state/` 被 `.gitignore` 排除，所以 **git 更新本身不会碰它**。
真正会丢数据的只有两种情况：手动清仓库、或者整个 `state/` 被换掉。
下面三层保护就是专门防这两件事的。

---

## 三层保护

### 第 1 层：更新前强制快照（不可能跳过）

不要直接用 `git pull`。双击 **`apply-update.cmd`**，它会：

1. 先 `state_backup.py snapshot` 打一份快照（失败就中止，不更新）
2. 再 `git pull --rebase --autostash`
3. 更新后跑 `guard` 对比，发现任何人数据变少就**自动还原**
4. 最后才把你本地未提交的改动 `stash pop` 回来

任何时候想退回：`python state_backup.py restore --latest`

### 第 2 层：服务端「只增不减」合并

`POST /api/state` 不再直接覆盖进度文件，而是和磁盘上的旧进度做并集：

| 字段 | 规则 |
|---|---|
| `weeks[].done` | 取并集，谁都不会少 |
| `weeks[].hours` | 取较大值 |
| `weeks[].note` | 非空优先 |
| `interview.rounds` | 取较多的一方 |
| `questions` | 取较多的一方 |
| `resume` | 取 `updatedAtISO` 更新的一份 |

这样即使她的浏览器缓存丢了、推上来一份空进度，也 **推不掉** 已有打卡。
（想真的取消打卡，在前端点掉复选框即可，走的是正常路径。）

### 第 3 层：启动自检

服务启动时会检查每个注册成员的 `progress.json` 是否还在。
谁没了就直接在控制台打红框告警，并给出还原命令：

```
python state_backup.py list
python state_backup.py restore --latest
```

---

## 她的专属链接（重要）

她的浏览器要打开 **带 `u=u2` 的链接**，而不是普通链接：

```
http://192.168.3.5:8787/?k=8YS-xuRmnpq9&u=u2
```

区别：

- 带 `&u=u2` → 永远进她自己的账号（清缓存、换浏览器都不会跑偏）
- 不带 `u=` → 进主账号「我（本人）」

把这条链接发给她存成书签。**这个链接不要发给第三个人**，否则对方会看到她的画像。

---

## 日常命令

```powershell
# 体检：每人打卡/画像是否齐全（更新前后都可以跑）
python state_backup.py verify

# 手动打一份快照
python state_backup.py snapshot

# 看所有快照
python state_backup.py list

# 还原最近一份
python state_backup.py restore --latest

# 还原指定一份
python state_backup.py restore --name state-20261021-151445-baseline
```

快照存在 `backups/state/`，默认保留最近 20 份。

---

## 一键更新流程（推荐）

1. 双击 `apply-update.cmd`
2. 看最后是否出现「更新完成。进度与画像全部完好。」
3. 让她刷新页面（她不用做任何操作）

如果看到「已自动还原」，说明这次更新确实覆盖了数据，已经帮你退回去了。
把红字部分发给 DSH，让 AI 查是哪里覆盖的。

---

## 保险起见

- 你的 `backups/` 里还有每天 22:00 的整包备份（`AgentHub-Backup` 计划任务），
  那个是 `workspace-*.zip`，包含完整的 `state/`（含冉冉的画像），保留 10 份。
- 已实测验证：备份 zip 里能取回 `users/u2/memory.json`，称呼/课题/11 个画像字段都在；
  API Key 在 zip 里是**空值**（默认脱敏），可以安全地留在硬盘上。
- 该任务已设 `StartWhenAvailable`：22:00 电脑没开，下次开机自动补跑一次。
- 两层备份互不依赖：`backups/state/` 是细粒度、只存数据；
  `workspace-*.zip` 是粗粒度、连代码一起存。

### 从 zip 里单独救一个人

```powershell
# 只解出冉冉的数据，不覆盖别人
Expand-Archive backups\workspace-20261021-152354.zip -DestinationPath $env:TEMP\rs
Copy-Item $env:TEMP\rs\ai-agent-hub\state\users\u2 -Destination ai-agent-hub\state\users\u2 -Recurse -Force
python state_backup.py verify
```

---

## 已经踩过的两个坑（别再踩）

1. **不要用 `git stash -u` 来「清干净工作区」再更新。**
   `-u` 会把未跟踪的 `apply-update.cmd` 自己也收走，脚本跑到一半文件消失，
   cmd 报 `The batch file cannot be found`。脚本里已改成只 stash 已跟踪文件。
2. **服务端打印 emoji 会打崩整个服务。**
   Windows 控制台默认 GBK，`⚠️` 编不出来会 `UnicodeEncodeError` 直接退出。
   已在 `main()` 里把 stdout/stderr 改成 utf-8 + `errors="replace"`。

