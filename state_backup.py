#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
state_backup.py · 保护 state/ 里所有人的进度与画像

为什么需要它：
    state/ 被 .gitignore 排除（里面有 API Key 和个人数据，绝不能进 git）。
    所以 git 更新不会碰 state/，正常情况下是安全的。
    但真正会丢数据的场景有两个：
      1) 手动 git clean -fdx / 重置仓库 / 换电脑拷贝，会把 state/ 一起清掉；
      2) 同学那边（局域网访问）的进度全在这台机器的 state/users/<slug>/ 里，
         一旦 state/ 没了，她的画像和打卡就全丢了，而且没有第二份。

用法：
    python state_backup.py snapshot              # 打一份当前快照
    python state_backup.py snapshot --tag pre-update
    python state_backup.py list                  # 列出已有快照
    python state_backup.py restore --latest      # 还原最近一份（会先给当前状态再打一份快照）
    python state_backup.py restore --name state-20261021-220000
    python state_backup.py verify                # 体检：成员是否齐全、各人进度是否还在
    python state_backup.py guard --before <snap> # 更新后对比，发现被覆盖就自动还原

快照放在 backups/state/ 下，默认保留最近 20 份。
"""

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # ai-agent-hub/
STATE = ROOT / "state"
USERS = STATE / "users"
SNAP_ROOT = ROOT.parent / "backups" / "state"

KEEP = 20


def now_stamp():
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


# --------------------------------------------------------------------------- #
# 体检：把「每人有多少进度/画像」抽成一份摘要，用于对比是否被覆盖
# --------------------------------------------------------------------------- #
def summarize():
    """返回 {slug: {...}} 的可比较摘要。不包含 Key 等敏感值。"""
    out = {}
    if not USERS.exists():
        return out
    for d in sorted(USERS.iterdir()):
        if not d.is_dir():
            continue
        slug = d.name
        prog = read_json(d / "progress.json", {}) or {}
        mem = read_json(d / "memory.json", {}) or {}
        weeks = prog.get("weeks") or {}
        done = 0
        for w in weeks.values():
            if isinstance(w, dict):
                done += len(w.get("done") or [])
        out[slug] = {
            "doneTasks": done,
            "weeks": len([1 for w in weeks.values() if isinstance(w, dict) and (w.get("done") or [])]),
            "profileKeys": len(mem.get("profile") or {}),
            "notes": len(mem.get("notes") or []),
            "faq": len(mem.get("faq") or []),
            "milestones": len(mem.get("milestones") or []),
            "onboarded": bool(mem.get("onboarded")),
            "hasResume": bool(prog.get("resume")),
            "memoryUpdatedAt": mem.get("updatedAt") or "",
            "progressUpdatedAt": prog.get("updatedAt") or "",
        }
    return out


def users_registry():
    data = read_json(STATE / "users.json", {}) or {}
    return [(u.get("slug"), u.get("name"), bool(u.get("primary")))
            for u in (data.get("users") or []) if u.get("slug")]


# --------------------------------------------------------------------------- #
# snapshot
# --------------------------------------------------------------------------- #
def snapshot(tag="", name_only=False):
    if not STATE.exists():
        if name_only:
            print("")
        else:
            print("❌ 没有 state/ 目录，无法备份：%s" % STATE)
        return None
    stamp = now_stamp()
    name = "state-%s%s" % (stamp, ("-" + tag) if tag else "")
    dst = SNAP_ROOT / name
    if dst.exists():
        if name_only:
            print("")
        else:
            print("❌ 同名快照已存在：%s" % dst)
        return None
    SNAP_ROOT.mkdir(parents=True, exist_ok=True)
    shutil.copytree(STATE, dst, ignore=shutil.ignore_patterns("images", "*.log", "__pycache__"))
    summary = summarize()
    write_json(dst / "_summary.json", {
        "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "tag": tag,
        "users": summary,
        "registry": users_registry(),
    })
    if name_only:
        # 给 .cmd 脚本用：只有一行目录名，方便直接取值
        print(name)
        return dst
    print("✅ 已备份 state/ → %s" % dst)
    for slug, s in summary.items():
        print("   · %-6s 打卡 %d 项 / 画像 %d 字段 / 笔记 %d 条" %
              (slug, s["doneTasks"], s["profileKeys"], s["notes"]))
    prune()
    return dst


def prune(keep=KEEP):
    if not SNAP_ROOT.exists():
        return
    snaps = sorted([d for d in SNAP_ROOT.iterdir() if d.is_dir() and d.name.startswith("state-")],
                   key=lambda p: p.name)
    for old in snaps[:-keep] if len(snaps) > keep else []:
        shutil.rmtree(old, ignore_errors=True)
        print("   · 清理旧快照 %s" % old.name)


def list_snaps():
    if not SNAP_ROOT.exists():
        print("（还没有任何快照）")
        return []
    snaps = sorted([d for d in SNAP_ROOT.iterdir() if d.is_dir() and d.name.startswith("state-")],
                   key=lambda p: p.name, reverse=True)
    if not snaps:
        print("（还没有任何快照）")
        return snaps
    print("快照目录：%s\n" % SNAP_ROOT)
    for d in snaps:
        info = read_json(d / "_summary.json", {}) or {}
        tag = info.get("tag") or "-"
        parts = []
        for slug, s in (info.get("users") or {}).items():
            parts.append("%s:%d项/%d字段" % (slug, s.get("doneTasks", 0), s.get("profileKeys", 0)))
        print("  %-34s %s  [%s]  %s" % (d.name, info.get("createdAt", "?"), tag, " ".join(parts)))
    return snaps


# --------------------------------------------------------------------------- #
# restore
# --------------------------------------------------------------------------- #
def restore(name=None, use_latest=False):
    if not SNAP_ROOT.exists():
        print("❌ 没有任何快照可还原")
        return False
    if use_latest or not name:
        snaps = sorted([d for d in SNAP_ROOT.iterdir() if d.is_dir() and d.name.startswith("state-")],
                       key=lambda p: p.name)
        if not snaps:
            print("❌ 没有任何快照可还原")
            return False
        src = snaps[-1]
    else:
        src = SNAP_ROOT / name
        if not src.exists():
            print("❌ 找不到快照：%s" % src)
            return False

    # 先把「现在」也存一份，避免还原本身成为不可逆操作
    snapshot(tag="before-restore")

    for item in src.iterdir():
        if item.name == "_summary.json":
            continue
        target = STATE / item.name
        if item.is_dir():
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)
    print("✅ 已从 %s 还原 state/" % src.name)
    summary = summarize()
    for slug, s in summary.items():
        print("   · %-6s 打卡 %d 项 / 画像 %d 字段" % (slug, s["doneTasks"], s["profileKeys"]))
    return True


# --------------------------------------------------------------------------- #
# guard：更新之后对比，判断是否被覆盖
# --------------------------------------------------------------------------- #
def guard(before_name):
    """对比 before 快照与当前 state：
       若某成员当前「打卡数 + 画像字段数」比快照少 → 判定被覆盖，自动还原。"""
    src = SNAP_ROOT / before_name
    if not src.exists():
        print("⚠️ 找不到更新前的快照 %s，跳过比对" % before_name)
        return 0
    before = (read_json(src / "_summary.json", {}) or {}).get("users") or {}
    after = summarize()

    lost = []
    for slug, b in before.items():
        a = after.get(slug)
        if a is None:
            lost.append((slug, "整个成员目录不见了", b, {}))
            continue
        # 逐项比较：任何一项变少都算被覆盖（不要只看总数，否则
        # 「画像被清空但打卡多了」这种会漏掉）
        keys = ("doneTasks", "profileKeys", "notes", "faq", "milestones")
        shrunk = [k for k in keys if (a.get(k, 0) or 0) < (b.get(k, 0) or 0)]
        if shrunk:
            lost.append((slug, "变少的项：" + "、".join(shrunk), b, a))
            continue
        # 画像从「已填写」变成「未填写」，也是被覆盖
        if b.get("onboarded") and not a.get("onboarded"):
            lost.append((slug, "画像标记被清空", b, a))

    if not lost:
        print("✅ 更新后数据完好：%d 位成员的打卡与画像都没有减少" % len(before))
        return 0

    print("🚨 检测到数据被覆盖，准备自动还原：")
    for slug, why, b, a in lost:
        print("   · %s —— %s（更新前 打卡%d/画像%d/笔记%d → 更新后 打卡%d/画像%d/笔记%d）" % (
            slug, why,
            b.get("doneTasks", 0), b.get("profileKeys", 0), b.get("notes", 0),
            a.get("doneTasks", 0), a.get("profileKeys", 0), a.get("notes", 0)))
    restore(name=before_name)
    print("✅ 已自动还原到更新前的状态")
    return 1


# --------------------------------------------------------------------------- #
def verify():
    print("state/ 体检")
    print("  目录：%s" % STATE)
    if not STATE.exists():
        print("  ❌ state/ 不存在")
        return 1
    reg = users_registry()
    summary = summarize()
    print("  注册成员：%d 位" % len(reg))
    bad = 0
    for slug, name, primary in reg:
        s = summary.get(slug)
        if not s:
            print("  ❌ %-6s（%s）没有数据目录 → 进度和画像已丢" % (slug, name))
            bad += 1
            continue
        flag = "主账号" if primary else "　　"
        ok = "✅" if s["onboarded"] else "⚠️ 未填画像"
        print("  %s %-6s %s 打卡 %d 项 / 画像 %d 字段 / 笔记 %d 条 / FAQ %d 条 %s" % (
            flag, slug, name, s["doneTasks"], s["profileKeys"], s["notes"], s["faq"], ok))
    orphan = [k for k in summary if k not in [r[0] for r in reg]]
    if orphan:
        print("  ⚠️ 有目录但不在注册表里：%s（不影响使用）" % "、".join(orphan))
    snaps = list(SNAP_ROOT.iterdir()) if SNAP_ROOT.exists() else []
    snaps = [d for d in snaps if d.is_dir() and d.name.startswith("state-")]
    print("  可用快照：%d 份（目录 %s）" % (len(snaps), SNAP_ROOT))
    if not snaps:
        print("  ⚠️ 还没有任何快照，建议先跑一次：python state_backup.py snapshot")
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description="保护 state/ 里的进度与画像")
    sub = ap.add_subparsers(dest="cmd")

    sp = sub.add_parser("snapshot", help="打一份快照")
    sp.add_argument("--tag", default="", help="给快照加个标签，例如 pre-update")
    sp.add_argument("--name-only", action="store_true", help="只输出快照目录名，供脚本读取")

    sub.add_parser("list", help="列出已有快照")

    rp = sub.add_parser("restore", help="还原某份快照")
    rp.add_argument("--name", default="", help="快照目录名")
    rp.add_argument("--latest", action="store_true", help="还原最近一份")

    gp = sub.add_parser("guard", help="更新后对比并自动还原")
    gp.add_argument("--before", required=True, help="更新前的快照目录名")

    sub.add_parser("verify", help="体检：成员是否齐全、进度是否还在")

    args = ap.parse_args()
    if args.cmd == "snapshot":
        d = snapshot(tag=args.tag, name_only=getattr(args, "name_only", False))
        return 0 if d else 1
    if args.cmd == "list":
        list_snaps()
        return 0
    if args.cmd == "restore":
        return 0 if restore(name=args.name, use_latest=args.latest) else 1
    if args.cmd == "guard":
        return guard(args.before)
    if args.cmd == "verify":
        return verify()
    ap.print_help()
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
