#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
restart_server.py · 安全重启学习中枢服务

为什么需要单独一个脚本：
    start-hidden.vbs 是隐藏启动的，没有窗口可以关。
    要重启只能「找到占用 8787 端口的那个进程 → 结束它 → 重新拉起」。
    手动敲这些命令容易杀错进程，所以固化成一个脚本。

它做的事：
    1. 按端口 8787（可改）精确找到服务进程，不碰其他 Python 程序
    2. 结束它
    3. 用 start-hidden.vbs 重新启动（隐藏窗口，日志继续写 state\\server.log）
    4. 轮询 /api/health 确认真的起来了，起不来就报错
    5. 确认数据文件都还在

用法：
    python restart_server.py                # 重启 8787
    python restart_server.py --port 8888    # 指定端口
    python restart_server.py --status       # 只看状态，不重启
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = ROOT / "state"
VBS = ROOT / "start-hidden.vbs"
HEALTH = "/api/health"


def say(msg):
    print(msg, flush=True)


def listening_pids(port):
    """返回占用该端口的 PID 列表。用 netstat，不依赖 psutil。"""
    pids = []
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True,
                             text=True, encoding="utf-8", errors="replace").stdout
    except Exception as e:  # noqa: BLE001
        say("  ⚠️ 查端口失败：%s" % e)
        return pids
    needle = ":%d" % port
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        local, state, pid = parts[1], parts[3], parts[4]
        if local.endswith(needle) and state.upper() == "LISTENING":
            if pid.isdigit() and pid != "0" and pid not in pids:
                pids.append(pid)
    return pids


def process_name(pid):
    """确认这个 PID 真的是 python，避免误杀。"""
    try:
        out = subprocess.run(["tasklist", "/FI", "PID eq %s" % pid, "/FO", "CSV", "/NH"],
                             capture_output=True, text=True,
                             encoding="utf-8", errors="replace").stdout
        return out.strip().split(",")[0].strip('"') if out.strip() else ""
    except Exception:  # noqa: BLE001
        return ""


def health_ok(port, timeout=2):
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d%s" % (port, HEALTH), timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8", errors="replace"))
            return bool(data.get("ok")), data
    except Exception:  # noqa: BLE001
        return False, {}


def describe(port):
    """不重启，只报告当前状态。"""
    pids = listening_pids(port)
    ok, data = health_ok(port)
    say("  端口 %d：%s" % (port, ("运行中，PID " + "、".join(pids)) if pids else "没有服务在监听"))
    if ok:
        say("  健康检查：正常（模型 %s）" % (data.get("model") or "?"))
    elif pids:
        say("  健康检查：进程在但接口不通，可能正在启动或已卡死")
    return pids, ok


def main():
    ap = argparse.ArgumentParser(description="安全重启学习中枢服务")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--status", action="store_true", help="只看状态，不重启")
    ap.add_argument("--wait", type=int, default=25, help="启动最多等待秒数")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass

    port = args.port
    say("=" * 56)
    say("  重启学习中枢服务（端口 %d）" % port)
    say("=" * 56)

    if args.status:
        describe(port)
        return 0

    if not VBS.exists():
        say("  ❌ 找不到 %s，无法自动启动。" % VBS.name)
        say("     手动方式：双击 start-lan.cmd")
        return 1

    # 1) 停掉旧进程
    pids = listening_pids(port)
    if not pids:
        say("  · 当前没有服务在跑，直接启动。")
    else:
        for pid in pids:
            name = process_name(pid).lower()
            if "python" not in name:
                say("  ❌ 端口 %d 被 %s（PID %s）占用，不是 python，已中止。" % (port, name or "未知进程", pid))
                say("     我不会杀非 python 的进程。请你自己确认后处理。")
                return 1
            say("  · 结束旧服务 PID %s（%s）" % (pid, name))
            subprocess.run(["taskkill", "/PID", pid, "/F"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")

        # 等端口真的释放，否则新进程会因端口被占而启动失败
        for _ in range(20):
            time.sleep(0.3)
            if not listening_pids(port):
                break
        else:
            say("  ❌ 等了 6 秒端口还是被占用，已中止。")
            return 1
        say("  · 端口已释放")

    # 2) 重新启动（隐藏窗口，和开机自启同一条路径）
    say("  · 正在启动…")
    try:
        subprocess.run(["wscript.exe", str(VBS)], cwd=str(ROOT),
                       capture_output=True, timeout=15)
    except Exception as e:  # noqa: BLE001
        say("  ❌ 启动失败：%s" % e)
        return 1

    # 3) 轮询健康检查，确认真的起来了
    ok = False
    for i in range(args.wait * 2):
        time.sleep(0.5)
        ok, data = health_ok(port)
        if ok:
            break
    if not ok:
        say("  ❌ 等了 %d 秒服务没起来。" % args.wait)
        say("     看一下日志：%s" % (STATE / "server.log"))
        tail = tail_log(STATE / "server.log", 15)
        if tail:
            say("     —— 日志末尾 ——")
            for line in tail:
                say("     " + line)
        return 1

    new_pids = listening_pids(port)
    say("  ✅ 已重启（PID %s），健康检查通过" % "、".join(new_pids))

    # 4) 确认数据文件都在
    try:
        data = json.loads((STATE / "users.json").read_text(encoding="utf-8"))
        users = [u.get("slug") for u in data.get("users") or [] if u.get("slug")]
    except Exception:  # noqa: BLE001
        users = []
    missing = [s for s in users if not (STATE / "users" / s / "progress.json").exists()]
    if missing:
        say("  ⚠️ 这些成员的数据文件不见了：%s" % "、".join(missing))
        say("     用 python state_backup.py restore --latest 还原")
        return 1
    say("  ✅ 成员数据齐全：%s" % "、".join(users) if users else "  （没有注册成员）")
    return 0


def tail_log(path, n):
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return lines[-n:]
    except Exception:  # noqa: BLE001
        return []


if __name__ == "__main__":
    sys.exit(main())
