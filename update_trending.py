#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
独立更新脚本：不用打开网站也能更新 GitHub 热榜。

用法：
    python update_trending.py              # 抓取四个窗口 + 按设置生成分析
    python update_trending.py --no-analyze # 只抓数据，不调用模型（不花额度）

想让它每天自动跑（即使网站没开），可用 Windows 计划任务：
    schtasks /Create /TN "agent-hub-trending" /SC DAILY /ST 08:00 ^
      /TR "\"C:\\Python\\python.exe\" \"C:\\Users\\Giraffe\\Documents\\deepseek-harness\\default-workspace\\ai-agent-hub\\update_trending.py\""
（路径按你实际环境改；删除用 schtasks /Delete /TN "agent-hub-trending" /F）
"""

import argparse
import sys

import server as hub


def main():
    ap = argparse.ArgumentParser(description="更新 GitHub 热榜数据（独立运行）")
    ap.add_argument("--no-analyze", action="store_true", help="只抓数据，不调用模型")
    ap.add_argument("--hour", type=int, help="顺便修改每日自动更新时间（0-23）")
    args = ap.parse_args()

    hub.ensure_dirs()
    hub.ensure_memory()

    if args.hour is not None:
        data = hub.load_trending()
        data.setdefault("auto", {})["hour"] = max(0, min(23, args.hour))
        hub.save_json(hub.TRENDING_FILE, data)

    if args.no_analyze:
        data = hub.load_trending()
        data.setdefault("auto", {})["analyze"] = "off"
        hub.save_json(hub.TRENDING_FILE, data)

    status = hub.run_daily_trending_update(reason="独立脚本")
    print("更新完成：" + status)
    data = hub.load_trending()
    for key, entry in sorted(data.get("windows", {}).items()):
        n = len((entry or {}).get("items") or [])
        print("  %-12s %2d 条  抓取于 %s" % (key, n, data.get("fetchedAt", {}).get(key, "—")))
    an = data.get("analyses", {})
    for key in sorted(an.keys()):
        a = an[key] or {}
        print("  分析 %-12s 来源=%s 时间=%s" % (key, a.get("source"), a.get("at")))
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())