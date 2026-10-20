#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Agent 学习中枢 · 本地服务
------------------------------------------------
只用 Python 标准库，零第三方依赖。

功能：
  1. 托管静态站点（路线图 / 简历工坊 / 模拟面试 / 答疑汇报）
  2. 代理 DeepSeek API（聊天 + 面试评分），Key 只存本机
  3. 进度落盘：state/progress.json + 工作区可读的《学习进度报告.md》

启动：
  python server.py            # 默认 http://127.0.0.1:8787
  python server.py --port 9000 --no-browser
"""

import argparse
import json
import mimetypes
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # ai-agent-hub/
STATE_DIR = ROOT / "state"
USERS_FILE = STATE_DIR / "users.json"            # 成员注册表
USERS_DIR = STATE_DIR / "users"                  # 每位成员一个目录
MACHINE_FILE = STATE_DIR / "machine.json"        # 当前机器（全局，自动探测，与成员无关）
SETTINGS_FILE = STATE_DIR / "settings.json"      # 模型配置（全局共用）
TRENDING_FILE = STATE_DIR / "trending.json"      # 热榜数据（全局）+ 按成员的分析
TRENDING_TTL_HOURS = 6          # 手动触发时的最小间隔参考
TRENDING_WINDOWS = ("week", "month", "quarter", "all")
TRENDING_DEFAULT_HOUR = 8       # 默认每天 08:00 自动更新
TRENDING_DEFAULT_ANALYZE = "week"   # off | week | all
WORKSPACE_REPORT = ROOT.parent / "学习进度报告.md"   # 主成员的报告（方便在 DSH 对话里直接读取）

# 旧版单用户路径：首次启动会迁移进 state/users/<slug>/
LEGACY_PROGRESS = STATE_DIR / "progress.json"
LEGACY_MEMORY = STATE_DIR / "memory.json"
LEGACY_REQUESTS = STATE_DIR / "requests.jsonl"
LEGACY_INTERVIEW = STATE_DIR / "interview-log.jsonl"

DEFAULT_USER = {"slug": "me", "name": "我（本人）", "emoji": "🙋", "primary": True, "createdAt": ""}

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_THINKING = "high"        # off | low | medium | high
DEFAULT_THINKING_BUDGET = 16384  # 思考链 token 预算
GRADE_THINKING = "medium"        # 面试评分固定用中档，避免每题等十几秒
DEFAULT_IMAGE_MODEL = "qwen-image-3.0-pro"
MAX_BODY = 12 * 1024 * 1024      # 允许带图请求（客户端已压缩，实际远小于此）
MAX_IMAGES_PER_REQUEST = 6
IMAGES_DIR = STATE_DIR / "images"

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")

TOKEN_FILE = STATE_DIR / "lan-token.txt"
ACCESS_TOKEN = ""      # 局域网模式下必须带令牌才能调用 /api/*（防止同网段的人蹭额度）


def load_or_create_token():
    try:
        if TOKEN_FILE.exists():
            t = TOKEN_FILE.read_text(encoding="utf-8").strip()
            if t:
                return t
        import secrets  # noqa: PLC0415
        t = secrets.token_urlsafe(9)
        ensure_dirs()
        TOKEN_FILE.write_text(t, encoding="utf-8")
        return t
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("生成访问令牌失败：%s\n" % e)
        return ""


def lan_ips():
    """列出本机的局域网地址，方便把访问链接发给别人。"""
    ips = []
    try:
        import socket as _s  # noqa: PLC0415
        sock = _s.socket(_s.AF_INET, _s.SOCK_DGRAM)
        try:
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if ip and not ip.startswith("127."):
                ips.append(ip)
        finally:
            sock.close()
    except Exception:
        pass
    try:
        import socket as _s  # noqa: PLC0415
        for info in _s.getaddrinfo(_s.gethostname(), None, _s.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    return ips

_lock = threading.Lock()
_model_lock = threading.Lock()   # 串行化模型请求：该端点并发调用会互踢（SSL EOF）


# --------------------------------------------------------------------------- #
# 存储
# --------------------------------------------------------------------------- #
def ensure_dirs():
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


# --------------------------------------------------------------------------- #
# 持久记忆档案：跨「清空对话 / 重启网站 / 换浏览器」都不会丢
# --------------------------------------------------------------------------- #
DEFAULT_PROFILE = {
    "身份": "双非本硕；本科人工智能，硕士电子信息（控制方向，研二）",
    "课题": "四旋翼无人机吊挂系统的建模与防摆控制",
    "目标岗位": "AI Agent / 大模型应用开发（备选：无人机机器人、国企研究所、高校事业单位）",
    "求职节点": "2027-03 投暑期实习，2027-09 秋招（2028-06 毕业）",
    "每周可投入": "10–20 小时",
    "优势": "MATLAB/Simulink/ROS 较熟；AI 编程工具（Codex / DeepSeek Harness）用得好；有真实科研场景；导师允许外出实习",
    "短板": "Python 只会改别人的代码；算法与数学生疏；Linux/Git 不熟；英文论文吃力",
    "学习方式偏好": "**优先自己在网页端按「教学」动手做**，要求讲清每一步是干什么的、装完怎么验证；只有实在装不上/做不了时才让 DSH 代做。给方案时默认「教我怎么做」，而不是「替我做完」",
}

DEFAULT_ENVIRONMENT = {}   # 当前机器一律靠探测，避免把「另一台机器的配置」当成事实

# 他名下的设备（可编辑；「当前」标记由探测结果自动维护）
DEFAULT_DEVICES = [
    {"name": "工位笔记本", "配置": "低配（具体参数以上方自动探测为准）",
     "用途": "日常学习、写代码、调云端 API、看文档、轻量开发；本网站就跑在它上面。**不要在上面跑 7B 模型或重型 Docker**",
     "当前": ""},
    {"name": "家里台式机", "配置": "AMD Ryzen 7 7800X3D + RTX 4070 Super 12GB + DDR5 32GB + 1TB",
     "用途": "需要 GPU 的实验：本地跑 7B/8B（int4）、LoRA/QLoRA 微调、vLLM 部署，回家再做", "当前": ""},
    {"name": "实验室机器", "配置": "据他说有可跑 7B 级模型的显卡（具体待确认）",
     "用途": "和课题相关、或需要更强算力的实验", "当前": ""},
]

DEFAULT_ENV_NOTES = {
    "机器分工原则": "白天在工位笔记本（4GB 显存 / 内存紧张）→ 只做云端 API、写代码、轻量服务；晚上或周末回家用台式机（12GB 显存）→ 本地模型、微调、部署类实验",
    "笔记本注意": "内存常年只剩 3–5GB：别同时开 Docker Desktop + 大模型本地推理 + 多个浏览器标签；向量库优先用 Chroma（进程内），不要上 Milvus",
    "实验室资源": "有可跑 7B 模型的显卡（使用规则待确认）",
}


def _windows_hardware():
    """Windows 下取 CPU 型号与内存（只用标准库）。"""
    out = {}
    try:
        import winreg  # noqa: PLC0415
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                             r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        out["CPU"] = str(winreg.QueryValueEx(key, "ProcessorNameString")[0]).strip()
    except Exception:
        pass
    try:
        import ctypes  # noqa: PLC0415

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
            out["内存"] = "%.0f GB（可用 %.0f GB）" % (stat.ullTotalPhys / 2 ** 30, stat.ullAvailPhys / 2 ** 30)
    except Exception:
        pass
    return out


def _is_laptop():
    """有无电池判断笔记本 / 台式机（拿不到就返回 None）。"""
    try:
        import ctypes  # noqa: PLC0415

        class SYSTEM_POWER_STATUS(ctypes.Structure):
            _fields_ = [("ACLineStatus", ctypes.c_byte), ("BatteryFlag", ctypes.c_byte),
                        ("BatteryLifePercent", ctypes.c_byte), ("SystemStatusFlag", ctypes.c_byte),
                        ("BatteryLifeTime", ctypes.c_ulong), ("BatteryFullLifeTime", ctypes.c_ulong)]

        st = SYSTEM_POWER_STATUS()
        if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(st)):
            flag = st.BatteryFlag & 0xFF
            if flag == 128:
                return False          # 无系统电池 → 台式机
            if flag in (1, 2, 4, 8, 9, 11):
                return True           # 有电池 → 笔记本
        return None
    except Exception:
        return None


def _find_exe(name):
    """找可执行文件：先看 PATH，再去常见安装目录兜底。
    返回 (路径, 是否在 PATH 里)。"""
    import glob  # noqa: PLC0415
    import shutil  # noqa: PLC0415

    found = shutil.which(name)
    if found:
        return found, True
    cands = []
    home = os.path.expanduser("~")
    appdata = os.environ.get("APPDATA") or ""
    local = os.environ.get("LOCALAPPDATA") or ""
    if appdata:
        cands += glob.glob(os.path.join(appdata, "Python", "*", "Scripts", name + ".exe"))
    if local:
        cands += glob.glob(os.path.join(local, "Programs", "Python", "*", "Scripts", name + ".exe"))
    cands += [
        os.path.join(home, ".local", "bin", name + ".exe"),
        os.path.join(home, ".cargo", "bin", name + ".exe"),
    ]
    for c in cands:
        if os.path.isfile(c):
            return c, False
    return "", None


def _which_version(cmd, args=("--version",), timeout=12):
    """返回 (状态, 版本字符串)。状态：'path' 在 PATH 里 / 'found' 装了但不在 PATH / 'missing'。"""
    path, in_path = _find_exe(cmd)
    if not path:
        return "missing", ""
    try:
        import subprocess  # noqa: PLC0415
        proc = subprocess.run([path] + list(args), stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, timeout=timeout)
        out = (proc.stdout or b"").decode("utf-8", "ignore").strip().splitlines()
        first = out[0].strip() if out else ""
        return ("path" if in_path else "found"), first[:80]
    except Exception:
        return ("path" if in_path else "found"), ""   # 命令存在但取版本失败（沙箱限制等）


def detect_tools():
    """探测开发工具链（每次启动刷新；也可在记忆页手动刷新）。"""
    tools = {}
    checks = [
        ("uv", "uv", ("--version",)),
        ("git", "git", ("--version",)),
        ("python", "python", ("--version",)),
        ("py 启动器", "py", ("-3", "--version")),
        ("node", "node", ("--version",)),
        ("docker", "docker", ("--version",)),
        ("ollama", "ollama", ("--version",)),
        ("VS Code", "code", ("--version",)),
    ]
    for label, cmd, args in checks:
        state, ver = _which_version(cmd, args)
        if state == "missing":
            tools[label] = "❌ 未检测到"
        elif state == "found":
            tools[label] = "⚠️ %s（已安装但不在 PATH，需用完整路径）" % (ver or "已安装")
        else:
            tools[label] = "✅ " + (ver or "已安装")
    # wsl 的输出是 UTF-16，且未安装/未启用时会返回 E_ACCESSDENIED，单独判断
    try:
        import subprocess  # noqa: PLC0415
        proc = subprocess.run(["wsl", "--status"], stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, timeout=12)
        raw = proc.stdout or b""
        text = ""
        for enc in ("utf-16-le", "utf-8"):
            try:
                text = raw.decode(enc, "ignore")
                if text.strip():
                    break
            except Exception:
                continue
        low = text.lower()
        flat = " ".join(text.split())[:70]
        if "e_accessdenied" in low or "access denied" in low:
            tools["wsl"] = "❌ 不可用（E_ACCESSDENIED：需要管理员权限启用/安装）"
        elif "未安装" in text or "not installed" in low or "no installed distributions" in low:
            tools["wsl"] = "❌ 未安装发行版"
        elif proc.returncode == 0 and text.strip():
            tools["wsl"] = "✅ " + flat
        else:
            tools["wsl"] = "❌ 不可用：" + (flat or "无输出")
    except Exception:
        tools["wsl"] = "❌ 未安装或不可用"
    # uv 也常以 py -3 -m uv 的形式可用（PATH 未配时）
    if tools.get("uv", "").startswith("❌"):
        try:
            import subprocess  # noqa: PLC0415
            proc = subprocess.run(["py", "-3", "-m", "uv", "--version"], stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, timeout=12)
            out = (proc.stdout or b"").decode("utf-8", "ignore").strip().splitlines()
            if proc.returncode == 0 and out:
                tools["uv"] = "✅ %s（需用 py -3 -m uv 调用，PATH 未配置）" % out[0].strip()[:60]
        except Exception:
            pass
    return tools


def detect_environment():
    """自动探测「当前这台机器」——每次启动刷新，绝不用别的机器的配置冒充。"""
    import platform  # noqa: PLC0415
    import shutil  # noqa: PLC0415

    env = {}
    try:
        env["主机名"] = platform.node()
    except Exception:
        pass
    try:
        env["操作系统"] = platform.platform()
    except Exception:
        pass
    try:
        env["Python"] = sys.version.split()[0]
    except Exception:
        pass
    if os.name == "nt":
        env.update(_windows_hardware())
    if not env.get("CPU"):
        env["CPU"] = platform.processor() or platform.machine()
    laptop = _is_laptop()
    if laptop is True:
        env["机型"] = "笔记本（有电池）"
    elif laptop is False:
        env["机型"] = "台式机（无电池）"
    try:
        total, _used, free = shutil.disk_usage(str(ROOT))
        env["磁盘"] = "总 %.0f GB / 可用 %.0f GB" % (total / 2 ** 30, free / 2 ** 30)
    except Exception:
        pass
    try:
        release = platform.uname().release.lower()
        if "microsoft" in release or "wsl" in release:
            env["运行环境"] = "WSL2（Linux 子系统，可跑 Linux 命令与 Docker）"
    except Exception:
        pass
    # GPU：nvidia-smi 可用时补上（拿不到就说明这台机器上没有 N 卡）
    try:
        import subprocess  # noqa: PLC0415
        proc = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=12)
        line = (proc.stdout or b"").decode("utf-8", "ignore").strip().splitlines()
        if line:
            env["GPU"] = line[0].strip()
            env["本机 CUDA 可用"] = "是（可用 nvidia-smi）"
        else:
            env["GPU"] = "未检测到 NVIDIA GPU（nvidia-smi 无输出）"
            env["本机 CUDA 可用"] = "否"
    except Exception:
        env["GPU"] = "未检测到（无 nvidia-smi 或不可用）"
        env["本机 CUDA 可用"] = "否"
    env["探测时间"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        env["已装工具"] = detect_tools()
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("工具链探测失败：%s\n" % e)
    return env


def default_memory(slug=None):
    """主成员用已有画像当默认值；新成员从空白开始，由引导问卷填写。"""
    slug = slug or current_slug()
    is_primary = bool((find_user(slug) or {}).get("primary"))
    return {
        "profile": dict(DEFAULT_PROFILE) if is_primary else {},
        "environment_notes": dict(DEFAULT_ENV_NOTES) if is_primary else {},
        "devices": [dict(d) for d in DEFAULT_DEVICES] if is_primary else [],
        "notes": [],
        "faq": [],
        "milestones": [],
        "watchlist": [],
        "onboarded": is_primary,      # 主成员视为已填写
        "updatedAt": "",
    }


def ensure_memory(slug=None):
    """按成员创建/补齐记忆档案；机器环境是全局的，另存 machine.json。"""
    slug = slug or current_slug()
    try:
        user_dir(slug).mkdir(parents=True, exist_ok=True)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("创建成员目录失败：%s\n" % e)
    is_primary = bool((find_user(slug) or {}).get("primary"))
    path = memory_file(slug)
    mem = load_json(path, None)
    if not isinstance(mem, dict):
        mem = default_memory(slug)
    base = default_memory(slug)
    for k, v in base.items():
        if k not in mem or mem[k] is None:
            mem[k] = v

    if not isinstance(mem.get("profile"), dict):
        mem["profile"] = dict(base["profile"])
    if is_primary:
        for k, v in base["profile"].items():
            if not str(mem["profile"].get(k) or "").strip():
                mem["profile"][k] = v
        if not isinstance(mem.get("devices"), list) or not mem["devices"]:
            mem["devices"] = [dict(d) for d in DEFAULT_DEVICES]
        # 一次性迁移（v2）
        if mem.get("memoryVersion") != 2:
            default_names = [d["name"] for d in DEFAULT_DEVICES]
            kept = [d for d in mem["devices"] if isinstance(d, dict) and str(d.get("name")) not in default_names]
            mem["devices"] = [dict(d) for d in DEFAULT_DEVICES] + kept
            mem["environment_notes"] = dict(DEFAULT_ENV_NOTES)
            mem["memoryVersion"] = 2
        if not isinstance(mem.get("environment_notes"), dict):
            mem["environment_notes"] = dict(DEFAULT_ENV_NOTES)
        for k, v in DEFAULT_ENV_NOTES.items():
            if not str(mem["environment_notes"].get(k) or "").strip():
                mem["environment_notes"][k] = v
    else:
        if not isinstance(mem.get("devices"), list):
            mem["devices"] = []
        if not isinstance(mem.get("environment_notes"), dict):
            mem["environment_notes"] = {}

    # 用全局机器信息给设备列表打「当前」标记
    try:
        env = load_machine()
        is_laptop = "笔记本" in str(env.get("机型", ""))
        for d in mem.get("devices", []):
            if not isinstance(d, dict):
                continue
            name = str(d.get("name") or "")
            if "笔记本" in name:
                d["当前"] = "✅ 是" if is_laptop else "否"
                if is_laptop:
                    d["配置"] = "本次探测：" + " / ".join(filter(None, [
                        env.get("CPU"), env.get("内存"), env.get("GPU"), env.get("磁盘")]))
            elif "台式机" in name:
                d["当前"] = "✅ 是" if (is_laptop is False) else "否"
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("设备标记失败：%s\n" % e)

    mem.pop("environment", None)      # 环境已移到全局，避免两份数据打架

    for k in ("notes", "faq"):
        if not isinstance(mem.get(k), list):
            mem[k] = []
    if not isinstance(mem.get("milestones"), list):
        mem["milestones"] = []
    if not isinstance(mem.get("watchlist"), list):
        mem["watchlist"] = []
    save_json(memory_file(), mem)
    return mem


def _clip(text, limit):
    return str(text or "").strip()[:limit]


# --------------------------------------------------------------------------- #
# 待办请求：把「让 DSH 帮我在电脑上做这件事」写成队列，DSH 读文件即可执行
# --------------------------------------------------------------------------- #
def load_requests():
    items = []
    try:
        with open(requests_file(), "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    items.append(json.loads(line))
                except Exception:
                    continue
    except FileNotFoundError:
        pass
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("读取待办失败：%s\n" % e)
    return items


def save_requests(items):
    ensure_dirs()
    tmp = requests_file().with_suffix(".jsonl.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for it in items[-200:]:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    os.replace(tmp, requests_file())


def save_json(path: Path, data):
    ensure_dirs()
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)   # 成员目录可能还没建
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("创建目录失败 %s：%s\n" % (path, e))
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


# --------------------------------------------------------------------------- #
# 成员（多用户）：每个成员一份独立的进度 / 记忆 / 待办 / 面试记录
# 机器环境是全局的（自动探测的是「当前这台电脑」，与成员无关）
# --------------------------------------------------------------------------- #
_current = threading.local()


def load_users():
    data = load_json(USERS_FILE, None)
    if not isinstance(data, dict) or not isinstance(data.get("users"), list) or not data["users"]:
        data = {"active": "me", "users": [dict(DEFAULT_USER)]}
        data["users"][0]["createdAt"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        save_json(USERS_FILE, data)
    if not data.get("active"):
        data["active"] = data["users"][0]["slug"]
    return data


def save_users(data):
    save_json(USERS_FILE, data)


def find_user(slug):
    for u in load_users()["users"]:
        if u.get("slug") == slug:
            return u
    return None


def primary_slug():
    for u in load_users()["users"]:
        if u.get("primary"):
            return u["slug"]
    return load_users()["users"][0]["slug"]


def set_current_user(slug):
    _current.slug = slug or primary_slug()


def current_slug():
    slug = getattr(_current, "slug", None)
    if slug and find_user(slug):
        return slug
    data = load_users()
    return data.get("active") or data["users"][0]["slug"]


def user_dir(slug=None):
    return USERS_DIR / (slug or current_slug())


def _ufile(name, slug=None):
    return user_dir(slug) / name


def progress_file(slug=None):
    return _ufile("progress.json", slug)


def memory_file(slug=None):
    return _ufile("memory.json", slug)


def requests_file(slug=None):
    return _ufile("requests.jsonl", slug)


def interview_file(slug=None):
    return _ufile("interview-log.jsonl", slug)


def report_path(slug=None):
    """主成员写 学习进度报告.md（DSH 固定读这个），其他成员写 学习进度报告-<名字>.md"""
    slug = slug or current_slug()
    u = find_user(slug) or {}
    if u.get("primary"):
        return WORKSPACE_REPORT
    safe = "".join(ch for ch in str(u.get("name") or slug) if ch not in '\\/:*?"<>|').strip() or slug
    return ROOT.parent / ("学习进度报告-%s.md" % safe)


def public_users():
    data = load_users()
    out = []
    for u in data["users"]:
        mem = load_json(memory_file(u["slug"]), {}) or {}
        prog = load_json(progress_file(u["slug"]), {}) or {}
        done = sum(len((v or {}).get("done", [])) for v in (prog.get("weeks") or {}).values())
        out.append({
            "slug": u["slug"], "name": u.get("name"), "emoji": u.get("emoji") or "🙂",
            "primary": bool(u.get("primary")), "createdAt": u.get("createdAt") or "",
            "onboarded": bool(mem.get("onboarded")),
            "doneTasks": done,
            "hasResume": bool((prog.get("resume") or {}).get("data")),
        })
    return {"active": data.get("active"), "users": out}


def migrate_to_multi_user():
    """把旧版单用户文件搬进 state/users/<主成员>/，并把环境搬到全局 machine.json。"""
    ensure_dirs()
    users = load_users()
    me = primary_slug()
    d = user_dir(me)
    d.mkdir(parents=True, exist_ok=True)
    for legacy, newpath in ((LEGACY_PROGRESS, progress_file(me)),
                            (LEGACY_MEMORY, memory_file(me)),
                            (LEGACY_REQUESTS, requests_file(me)),
                            (LEGACY_INTERVIEW, interview_file(me))):
        try:
            if legacy.exists() and not newpath.exists():
                os.replace(str(legacy), str(newpath))
                sys.stderr.write("[迁移] %s -> %s\n" % (legacy.name, newpath))
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("迁移 %s 失败：%s\n" % (legacy, e))
    # 旧 memory.json 里的 environment 提到全局 machine.json
    mem = load_json(memory_file(me), None)
    if isinstance(mem, dict) and isinstance(mem.get("environment"), dict) and mem["environment"]:
        if not MACHINE_FILE.exists():
            save_json(MACHINE_FILE, mem["environment"])
        mem.pop("environment", None)
        save_json(memory_file(me), mem)


def load_machine():
    """当前机器信息（全局）：启动时自动刷新，也可在记忆页点刷新。"""
    env = load_json(MACHINE_FILE, None)
    if not isinstance(env, dict):
        env = {}
        try:
            env = detect_environment()
        except Exception:  # noqa: BLE001
            env = {}
        save_json(MACHINE_FILE, env)
    return env


def refresh_machine():
    try:
        env = detect_environment()
        save_json(MACHINE_FILE, env)
        return env
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("环境探测失败：%s\n" % e)
        return load_machine()


def get_settings():
    s = load_json(SETTINGS_FILE, {})
    api_key = (s.get("apiKey") or os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    extra = s.get("extraParams")
    return {
        "apiKey": api_key,
        "model": (s.get("model") or DEFAULT_MODEL).strip(),
        "baseUrl": (s.get("baseUrl") or DEFAULT_BASE_URL).strip().rstrip("/"),
        "thinking": (s.get("thinking") or DEFAULT_THINKING).strip().lower(),
        "thinkingBudget": int(s.get("thinkingBudget") or DEFAULT_THINKING_BUDGET),
        "imageModel": (s.get("imageModel") or DEFAULT_IMAGE_MODEL).strip(),
        "visionModel": (s.get("visionModel") or "").strip(),
        "githubToken": (s.get("githubToken") or "").strip(),
        "extraParams": extra if isinstance(extra, dict) else {},
        "source": "settings" if s.get("apiKey") else ("env" if os.environ.get("DEEPSEEK_API_KEY") else "none"),
    }


def mask_key(k):
    """给前端一个可辨认但不完整的 Key 提示，用于确认「Key 还在」。"""
    if not k:
        return ""
    return (k[:6] + "…" + k[-4:]) if len(k) > 12 else ("…" + k[-4:])


def public_settings():
    s = get_settings()
    return {
        "hasKey": bool(s["apiKey"]),
        "keySource": s["source"],
        "keyHint": mask_key(s["apiKey"]),
        "model": s["model"],
        "baseUrl": s["baseUrl"],
        "thinking": s["thinking"],
        "thinkingBudget": s["thinkingBudget"],
        "imageModel": s["imageModel"],
        "visionModel": s["visionModel"],
        "hasGithubToken": bool(s["githubToken"]),
        "extraParams": s["extraParams"],
    }


# --------------------------------------------------------------------------- #
# DeepSeek 调用
# --------------------------------------------------------------------------- #
def _post_completion(payload, timeout):
    """发一次请求，返回 (body, err)。"""
    s = get_settings()
    req = urllib.request.Request(
        s["baseUrl"] + "/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + s["apiKey"],
        },
        method="POST",
    )
    try:
        with _model_lock:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "ignore")[:600]
        except Exception:
            pass
        return None, "%s|%s" % (e.code, detail or e.reason)
    except urllib.error.URLError as e:
        return None, "NET|无法连接模型接口（%s）。检查网络或 Base URL。" % e.reason
    except Exception as e:  # noqa: BLE001
        return None, "NET|调用模型失败：%s" % e


def _message_text(message):
    """兼容推理型模型：正文为空时回退到 reasoning_content。"""
    content = (message.get("content") or "").strip()
    if content:
        return content
    return (message.get("reasoning_content") or "").strip()


def apply_thinking(payload, level, budget):
    """把「思考强度」映射到端点参数。

    实测（2026-10，阿里云百炼兼容模式 deepseek-v4.1-flash）：
      · reasoning_effort 生效：medium 时思考 token 明显下降
      · enable_thinking + thinking_budget 生效：预算越大思考越充分
    因此默认同时下发这两个系列参数，取「更充分」的组合。
    """
    level = (level or DEFAULT_THINKING).lower()
    if level == "off":
        payload["enable_thinking"] = False
        return payload
    payload["enable_thinking"] = True
    payload["reasoning_effort"] = level if level in ("low", "medium", "high") else "high"
    try:
        b = int(budget)
    except Exception:  # noqa: BLE001
        b = DEFAULT_THINKING_BUDGET
    if b > 0:
        payload["thinking_budget"] = b
    return payload


def call_model(messages, temperature=0.3, json_mode=False, timeout=300, thinking=None, model=None):
    s = get_settings()
    if not s["apiKey"]:
        return None, "未配置 API Key：请在网站右上角「设置」里粘贴 Key（或用环境变量 DEEPSEEK_API_KEY）。"

    payload = {
        "model": (model or s["model"]).strip(),
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    apply_thinking(payload, thinking or s["thinking"], s["thinkingBudget"])
    if s["extraParams"]:
        payload.update(s["extraParams"])
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    body, err = _post_completion(payload, timeout)

    # 部分模型/部署不支持 response_format、enable_thinking 等额外参数：
    # 逐个降级重试，保证「能回答」优先于「参数完美」。
    if err and err.startswith("400"):
        for drop in ("response_format", "reasoning_effort", "thinking_budget", "enable_thinking"):
            if drop not in payload:
                continue
            trial = dict(payload)
            trial.pop(drop, None)
            body, err2 = _post_completion(trial, timeout)
            if body is not None:
                err = None
                break
            err = err2

    # 网络抖动（SSL EOF、连接被重置等）重试一次
    if err and err.startswith("NET"):
        time.sleep(2.5)
        body, err_retry = _post_completion(payload, timeout)
        if body is not None:
            err = None
        else:
            err = err_retry

    if err:
        code, _, detail = err.partition("|")
        if code == "NET":
            return None, detail
        return None, "模型接口返回 %s：%s" % (code, detail)
    try:
        choice = body["choices"][0]
        text = _message_text(choice.get("message") or {})
        if not text:
            return None, "模型返回了空内容（可能是 max_tokens 太小或触发了安全策略）。"
        usage = body.get("usage", {}) or {}
        details = usage.get("completion_tokens_details") or {}
        return {
            "content": text,
            "usage": usage,
            "reasoningTokens": details.get("reasoning_tokens"),
            "model": body.get("model", s["model"]),
        }, None
    except Exception as e:  # noqa: BLE001
        return None, "解析模型响应失败：%s（原始：%s）" % (e, json.dumps(body, ensure_ascii=False)[:300])


def list_models():
    """拉取端点支持的模型列表（便于换模型）。"""
    s = get_settings()
    if not s["apiKey"]:
        return None, "未配置 API Key"
    req = urllib.request.Request(
        s["baseUrl"] + "/models",
        headers={"Authorization": "Bearer " + s["apiKey"]},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return None, "接口返回 %s" % e.code
    except Exception as e:  # noqa: BLE001
        return None, str(e)
    items = body.get("data") or body.get("models") or []
    ids = [m.get("id") or m.get("model") or m.get("name") for m in items if isinstance(m, dict)]
    ids = [i for i in ids if i]
    # 优先把对话类模型排在前面
    def rank(mid):
        low = str(mid).lower()
        if "deepseek" in low:
            return 0
        if any(k in low for k in ("qwen3", "glm", "kimi", "gpt", "claude", "minimax", "step")):
            return 1
        if any(k in low for k in ("image", "tts", "asr", "audio", "vl", "ocr", "embedding", "rerank", "speech")):
            return 3
        return 2
    ids.sort(key=lambda x: (rank(x), str(x)))
    return ids, None


def clean_content(content, budget):
    """把消息内容规整成「字符串」或「文本+图片」数组，并挡住异常大的载荷。"""
    if isinstance(content, str):
        return content[:12000]
    if not isinstance(content, list):
        return ""
    out = []
    images = 0
    for item in content[:10]:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind == "text":
            text = str(item.get("text") or "").strip()
            if text:
                out.append({"type": "text", "text": text[:12000]})
        elif kind == "image_url":
            url = ((item.get("image_url") or {}) or {}).get("url") or ""
            if isinstance(url, str) and url.startswith("data:image/") and len(url) <= 4_000_000:
                if images >= budget:
                    continue
                out.append({"type": "image_url", "image_url": {"url": url}})
                images += 1
    return out


def has_image(messages):
    for m in messages:
        c = m.get("content")
        if isinstance(c, list) and any(isinstance(i, dict) and i.get("type") == "image_url" for i in c):
            return True
    return False


def generate_image(prompt, size="1024x1024", model=None, timeout=300):
    """调用兼容模式的 /images/generations 出图，并把图片落到本机（远端 URL 会过期）。"""
    s = get_settings()
    if not s["apiKey"]:
        return None, "未配置 API Key"
    use_model = (model or s["imageModel"] or DEFAULT_IMAGE_MODEL).strip()
    payload = {"model": use_model, "prompt": prompt, "n": 1, "size": size}
    req = urllib.request.Request(
        s["baseUrl"] + "/images/generations",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + s["apiKey"]},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "ignore")[:400]
        except Exception:
            pass
        return None, "出图接口返回 %s：%s" % (e.code, detail)
    except Exception as e:  # noqa: BLE001
        return None, "调用出图接口失败：%s" % e

    data = body.get("data") or []
    if not data:
        return None, "出图接口没有返回图片：%s" % json.dumps(body, ensure_ascii=False)[:300]
    first = data[0] or {}
    remote = first.get("url") or ""
    local_url = ""

    # 落地到本机，避免 OSS 链接过期后图片消失
    if remote:
        try:
            ensure_dirs()
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(remote, timeout=120) as r:
                raw = r.read()
            ext = ".png"
            ctype = (r.headers.get("Content-Type") or "").lower()
            if "jpeg" in ctype or "jpg" in ctype:
                ext = ".jpg"
            elif "webp" in ctype:
                ext = ".webp"
            name = "img-%d%s" % (int(time.time() * 1000), ext)
            (IMAGES_DIR / name).write_bytes(raw)
            local_url = "/state/images/" + name
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("图片落地失败：%s\n" % e)

    b64 = first.get("b64_json") or ""
    if not local_url and b64:
        local_url = "data:image/png;base64," + b64

    return {
        "model": use_model,
        "prompt": prompt,
        "url": local_url or remote,
        "remoteUrl": remote,
        "usage": body.get("usage", {}),
    }, None


# --------------------------------------------------------------------------- #
# GitHub 热榜：按「时间段内新建 + star 数」抓取，并用模型给出结合个人情况的推荐
# --------------------------------------------------------------------------- #
def _gh_headers():
    s = get_settings()
    h = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "agent-hub-local/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if s["githubToken"]:
        h["Authorization"] = "Bearer " + s["githubToken"]
    return h


def trending_query(window, ai_filter=False):
    from datetime import timedelta  # noqa: PLC0415
    now = datetime.now()

    def since(days):
        return (now - timedelta(days=days)).strftime("%Y-%m-%d")

    if window == "week":
        q = "created:>%s stars:>=50" % since(7)
    elif window == "month":
        q = "created:>%s stars:>=300" % since(30)
    elif window == "quarter":
        q = "created:>%s stars:>=1000" % since(90)
    else:
        q = "stars:>50000"
    if ai_filter:
        q += " stars:>10000" if window == "all" else ""
        q += " (llm OR agent OR rag OR mcp)"
    return q


def fetch_trending(window, ai_filter=False, per_page=20):
    import urllib.parse  # noqa: PLC0415
    q = trending_query(window, ai_filter)
    url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode({
        "q": q, "sort": "stars", "order": "desc", "per_page": per_page})
    req = urllib.request.Request(url, headers=_gh_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            body = json.loads(r.read().decode("utf-8"))
            remaining = r.headers.get("X-RateLimit-Remaining")
            reset = r.headers.get("X-RateLimit-Reset")
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "ignore")[:300]
        except Exception:
            pass
        if e.code == 403:
            return None, "GitHub 接口限流（未登录每小时 10 次搜索）。等一会儿再试，或在设置里填 GitHub Token 提高配额。", None
        return None, "GitHub 接口返回 %s：%s" % (e.code, detail), None
    except Exception as e:  # noqa: BLE001
        return None, "无法访问 GitHub（%s）" % e, None

    items = []
    for it in body.get("items", [])[:per_page]:
        items.append({
            "name": it.get("full_name"),
            "url": it.get("html_url"),
            "desc": (it.get("description") or "").strip()[:300],
            "stars": it.get("stargazers_count"),
            "forks": it.get("forks_count"),
            "lang": it.get("language") or "—",
            "created": (it.get("created_at") or "")[:10],
            "pushed": (it.get("pushed_at") or "")[:10],
            "topics": (it.get("topics") or [])[:6],
        })
    meta = {"query": q, "total": body.get("total_count"), "remaining": remaining}
    return {"items": items, "meta": meta}, None, reset


def load_trending():
    data = load_json(TRENDING_FILE, None)
    if not isinstance(data, dict):
        data = {"windows": {}, "analyses": {}, "fetchedAt": {}}
    data.setdefault("windows", {})
    data.setdefault("analyses", {})
    data.setdefault("fetchedAt", {})
    auto = data.setdefault("auto", {})
    auto.setdefault("hour", TRENDING_DEFAULT_HOUR)
    auto.setdefault("analyze", TRENDING_DEFAULT_ANALYZE)
    auto.setdefault("lastDate", "")
    auto.setdefault("lastRun", "")
    auto.setdefault("lastStatus", "")
    return data


def next_auto_run(data):
    """算出下一次自动更新的时间点，用于前端展示。"""
    auto = data.get("auto") or {}
    try:
        hour = int(auto.get("hour", TRENDING_DEFAULT_HOUR))
    except Exception:
        hour = TRENDING_DEFAULT_HOUR
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    if auto.get("lastDate") != today and now.hour >= hour:
        return "即将执行（今天 " + "%02d:00" % hour + "）"
    if now.hour < hour:
        return "今天 %02d:00" % hour
    return "明天 %02d:00" % hour


def run_daily_trending_update(reason=""):
    """每日更新：抓取四个窗口 + AI 过滤的近七天，并按设置生成分析。"""
    data = load_trending()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    targets = [("week", False), ("week", True), ("month", False), ("quarter", False), ("all", False)]
    ok, fails = 0, []
    for w, ai in targets:
        fetched, err, _ = fetch_trending(w, ai)
        if fetched:
            key = trending_key(w, ai)
            data["windows"][key] = fetched
            data["fetchedAt"][key] = now_str
            ok += 1
        else:
            fails.append("%s%s（%s）" % (w, "-ai" if ai else "", err))
    save_json(TRENDING_FILE, data)

    scope = (data.get("auto") or {}).get("analyze", TRENDING_DEFAULT_ANALYZE)
    analyzed, an_fails = [], []
    if scope and scope != "off":
        keys = [("week", False)] if scope == "week" else (
            [(w, False) for w in TRENDING_WINDOWS] + [("week", True)])
        # 每个成员各生成一份（画像不同，结论就该不同）；没填问卷的新成员先跳过省额度
        for u in load_users()["users"]:
            set_current_user(u["slug"])
            mem = load_json(memory_file(u["slug"]), {}) or {}
            if not mem.get("onboarded") and not u.get("primary"):
                continue
            for w, ai in keys:
                res, err = analyze_trending(w, ai)
                if res:
                    analyzed.append("%s/%s%s[%s]" % (u["slug"], w, "-ai" if ai else "", res.get("source")))
                else:
                    an_fails.append("%s/%s%s（%s）" % (u["slug"], w, "-ai" if ai else "", err))
        set_current_user(primary_slug())

    data = load_trending()          # analyze_trending 也写过文件，重新读一遍
    auto = data.setdefault("auto", {})
    auto["lastDate"] = datetime.now().strftime("%Y-%m-%d")
    auto["lastRun"] = now_str
    status = "抓取 %d/%d" % (ok, len(targets))
    if analyzed:
        status += "；分析 " + "、".join(analyzed)
    if fails or an_fails:
        status += "；失败：" + "；".join((fails + an_fails)[:3])
    if reason:
        status = "（%s）" % reason + status
    auto["lastStatus"] = status
    save_json(TRENDING_FILE, data)
    sys.stderr.write("[热榜] 自动更新完成：%s\n" % status)
    return status


def trending_scheduler():
    """常驻线程：每天到达设定时间执行一次；启动时若当天还没跑过且已过点，则补跑。"""
    time.sleep(20)                  # 让服务先起来
    while True:
        try:
            set_current_user(primary_slug())
            data = load_trending()
            auto = data.get("auto") or {}
            hour = int(auto.get("hour", TRENDING_DEFAULT_HOUR))
            now = datetime.now()
            if auto.get("lastDate") != now.strftime("%Y-%m-%d") and now.hour >= hour:
                run_daily_trending_update()
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("[热榜] 定时任务异常：%s\n" % e)
        time.sleep(600)             # 每 10 分钟检查一次


def trending_key(window, ai_filter):
    """热榜原始数据的缓存键（全局共享，抓一次两人都能看）"""
    return "%s%s" % (window, "-ai" if ai_filter else "")


def analysis_key(window, ai_filter, slug=None):
    """分析结果按成员分开缓存（每人画像不同，结论就该不同）"""
    return "%s@%s" % (trending_key(window, ai_filter), slug or current_slug())


def _personal_context():
    """给分析用的个人情况摘要。"""
    mem = load_json(memory_file(), {}) or {}
    p = mem.get("profile") or {}
    notes = mem.get("environment_notes") or {}
    prog = load_json(progress_file(), {}) or {}
    weak = ((prog.get("interview") or {}).get("weakCategories") or [])
    lines = []
    for k in ("身份", "课题", "目标岗位", "求职节点", "每周可投入", "优势", "短板", "学习方式偏好"):
        if p.get(k):
            lines.append("· %s：%s" % (k, p[k]))
    for k, v in notes.items():
        if k in ("机器分工原则", "笔记本注意", "Python 环境（2026-10-10 实测）"):
            lines.append("· %s：%s" % (k, v))
    if weak:
        lines.append("· 面试薄弱分类：" + "、".join(w.get("name", "") for w in weak))
    lines.append("· 正在学：20 周计划（W1–W6 工程打底 → W7–W12 RAG 项目 → W13–W20 Agent 项目）")
    return "\n".join(lines)


def heuristic_analysis(items):
    """没有模型 Key 时的兜底分析：按关键词 + 语言给等级与类型。"""
    out = []
    AI_HOT = ("agent", "llm", "rag", "mcp", "gpt", "langchain", "prompt", "embedding", "向量", "智能体", "大模型")
    PY_GOOD = ("python", "framework", "library", "sdk")
    USEFUL = ("cli", "terminal", "tui", "editor", "font", "automation", "utility", "utilities",
              "manager", "downloader", "proxy", "markdown", "note", "screenshot", "pdf", "cleaner",
              "monitor", "sync", "backup", "launcher", "keyboard", "shortcut", "convert", "viewer", "tool")
    AVOID = ("crypto", "trading", "cheat", "adult", "mining", "wallpaper")
    for it in items:
        text = (it.get("name", "") + " " + it.get("desc", "") + " " + " ".join(it.get("topics") or [])).lower()
        lang = (it.get("lang") or "").lower()
        stars = it.get("stars") or 0
        if any(k in text for k in AVOID):
            level, kind, fit = "不推荐", "不相关", "与你的方向无关，跳过。"
        elif any(k in text for k in AI_HOT) and lang in ("python", "—", ""):
            level = "非常推荐" if stars >= 1000 else "较为推荐"
            kind = "学习相关"
            fit = "AI/Agent 方向且是 Python 生态，与目标岗位直接相关：读 README 与架构图，别急着 clone 跑。"
        elif any(k in text for k in AI_HOT):
            level, kind, fit = "适中", "学习相关", "方向相关但主力语言不是 Python，只看架构与设计思路。"
        elif any(k in text for k in USEFUL):
            level, kind = "较为推荐", "实用工具"
            fit = "看起来是能提升日常效率的工具：如果确实解决你的痛点就用起来，不必为了学而学。"
        elif lang == "python" or any(k in text for k in PY_GOOD):
            level, kind, fit = "较为推荐", "学习相关", "Python 工具类项目，能补工程能力；挑一个读源码即可。"
        elif any(k in text for k in ("awesome", "book", "tutorial", "roadmap", "guide", "清单")):
            level, kind, fit = "适中", "视野扩展", "资源清单类，当索引用；注意别只收藏不实践。"
        else:
            level, kind, fit = "适中", "视野扩展", "热门但与你的路线关联一般，了解即可。"
        out.append({
            "name": it.get("name"),
            "intro": (it.get("desc") or "（无描述）")[:70],
            "fit": fit,
            "level": level,
            "kind": kind,
        })
    return out


def analyze_trending(window, ai_filter=False):
    data = load_trending()
    key = trending_key(window, ai_filter)
    akey = analysis_key(window, ai_filter)
    entry = data["windows"].get(key)
    if not entry or not entry.get("items"):
        fetched, err, _ = fetch_trending(window, ai_filter)
        if err:
            return None, err
        entry = fetched
        data["windows"][key] = entry
        data["fetchedAt"][key] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        save_json(TRENDING_FILE, data)

    items = entry["items"]
    s = get_settings()
    if not s["apiKey"]:
        result = {"items": heuristic_analysis(items), "source": "heuristic",
                  "at": datetime.now().strftime("%Y-%m-%d %H:%M"), "note": "未配置模型 Key，使用规则打分（离线兜底）"}
    else:
        listing = "\n".join(
            "%d. %s | 语言:%s | %s⭐ | 创建:%s | 描述:%s" % (
                i + 1, it["name"], it["lang"], it["stars"], it["created"], (it["desc"] or "无")[:140])
            for i, it in enumerate(items))
        sys_p = ("你是这位学生的专属学习与求职教练，同时也是一个很挑的工具推荐者。"
                 "评估 GitHub 热门项目对他的价值，只输出 JSON，不要解释。"
                 "推荐理由必须让读者一眼看出三件事：① 是因为好用、还是因为对学习有帮助；"
                 "② 如果两者都有，分别说清；③ 如果是「他已经很熟的东西」，必须明确说它对他当前的学习目标是否有增量。"
                 "你允许推荐与学习完全无关但确实好用的工具——只要它真能改善他的日常体验。")
        user_p = (
            "【他的情况】\n%s\n\n"
            "【GitHub 榜单：%s】\n%s\n\n"
            "评估时同时考虑两个维度，不要只用「跟学习有没有关系」来判断：\n"
            "A. 学习价值：对他「AI Agent / 大模型应用开发实习岗」的目标、以及 20 周计划里的某个阶段是否真有帮助？"
            "如果有，请点出**对应哪一周或哪个项目**（例如「正好补 W13 的手写 Agent 循环」）。\n"
            "B. 实用价值：即使与学习无关，它是不是一个真正好用、能明显提升日常效率的工具"
            "（CLI / 编辑器 / 自动化 / 文档 / 系统增强 / 可视化 / 游戏与桌面体验等）？"
            "要挑剔——不要因为热门、好玩、star 高就推荐。\n"
            "C. **区分「适合学」和「适合用」**：有些项目他已经在用、也很优秀（比如 DSH 这类 AI 编程工具），"
            "那么请直说「这东西你已经很熟，对你的学习目标没有增量，只是日常好用」，不要因为它是好项目就标成「非常推荐」。\n"
            "他每周只有 10–20 小时，时间最稀缺，宁可少推荐也不要凑数。\n\n"
            "对每个项目给出：\n"
            "intro：中文一句话说明它是什么、解决什么问题（≤45 字，不要复述英文描述）\n"
            "kind：只能是「学习相关」「实用工具」「视野扩展」「不相关」之一（这是推荐理由的归类）\n"
            "fit：推荐理由，**必须以下面之一开头，把原因说清楚**：\n"
            "      「学习价值：…」= 因为对学习/求职有帮助而推荐；\n"
            "      「实用价值：…」= 因为它是好用、能提升效率的工具而推荐；\n"
            "      「视野扩展：…」= 只是了解行业动向，不必投入；\n"
            "      「不推荐：…」= 说明为什么不值得花时间。\n"
            "      如果「学习价值」和「实用价值」都存在，写成「学习价值：…；实用价值：…」。\n"
            "      内容 ≤120 字，要具体（补什么能力 / 解决什么日常痛点 / 对应哪一周）。\n"
            "level：只能是「非常推荐」「较为推荐」「适中」「不推荐」之一\n"
            "输出 JSON：{\"items\":[{\"name\":\"仓库全名\",\"intro\":\"...\",\"kind\":\"...\",\"fit\":\"...\",\"level\":\"...\"}]}\n"
            "必须覆盖全部 %d 个项目，name 必须与列表完全一致。"
        ) % (_personal_context(), window_cn(window), listing, len(items))
        result_raw, err = call_model(
            [{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}],
            temperature=0.3, json_mode=True, thinking="medium", timeout=600)
        if err:
            return None, err
        parsed = extract_json(result_raw["content"]) or {}
        got = {str(x.get("name", "")).strip(): x for x in (parsed.get("items") or []) if isinstance(x, dict)}
        merged = []
        for it in items:
            a = got.get(it["name"]) or {}
            lvl = a.get("level")
            kind = a.get("kind")
            merged.append({
                "name": it["name"],
                "intro": (a.get("intro") or (it["desc"] or "（无描述）")[:60]),
                "fit": a.get("fit") or "模型未给出分析，可稍后重新生成。",
                "level": lvl if lvl in ("非常推荐", "较为推荐", "适中", "不推荐") else "适中",
                "kind": kind if kind in ("学习相关", "实用工具", "视野扩展", "不相关") else "视野扩展",
            })
        result = {"items": merged, "source": "model", "model": s["model"],
                  "at": datetime.now().strftime("%Y-%m-%d %H:%M"), "reasoningTokens": result_raw.get("reasoningTokens")}

    data["analyses"][akey] = result
    save_json(TRENDING_FILE, data)
    return result, None


def window_cn(window):
    return {"week": "近七天", "month": "近一个月", "quarter": "近三个月", "all": "总榜"}.get(window, window)


def write_report(slug=None):
    slug = slug or current_slug()
    try:
        text = render_progress_report(load_json(progress_file(slug), {}) or {}, slug)
        report_path(slug).write_text(text, encoding="utf-8")
        # 主成员的报告同时保留一份固定文件名，便于 DSH 直接读取
        if (find_user(slug) or {}).get("primary") and report_path(slug) != WORKSPACE_REPORT:
            WORKSPACE_REPORT.write_text(text, encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("写进度报告失败：%s\n" % e)


def extract_json(text):
    """从模型输出里抠出第一个 JSON 对象。"""
    if not text:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text[3:] else text
        text = text.lstrip("json").strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            return None
    return None


# --------------------------------------------------------------------------- #
# 进度 → Markdown（给 DSH 对话读的）
# --------------------------------------------------------------------------- #
def render_progress_report(progress, slug=None):
    slug = slug or current_slug()
    u = find_user(slug) or {}
    weeks = progress.get("weeks", {})
    total_tasks = progress.get("totalTasks") or 0
    done_tasks = sum(len(v.get("done", [])) for v in weeks.values())
    pct = round(done_tasks / total_tasks * 100, 1) if total_tasks else 0

    lines = []
    lines.append("# 学习进度报告 · %s（自动生成，勿手改）" % (u.get("name") or slug))
    lines.append("")
    lines.append("> 由 `ai-agent-hub` 网站自动写入，供 DSH 对话读取。成员：%s（%s）｜更新时间：%s" % (
        u.get("name") or slug, slug, datetime.now().strftime("%Y-%m-%d %H:%M")))
    lines.append("")
    lines.append("- 累计完成学习任务：**%d / %d（%s%%）**" % (done_tasks, total_tasks, pct))
    lines.append("- 累计投入时长：**%s 小时**" % progress.get("totalHours", 0))
    lines.append("- 最近打卡周：**%s**" % (progress.get("lastWeek") or "—"))
    lines.append("")

    # 待 DSH 执行的请求放在最显眼的位置
    try:
        pending = [it for it in load_requests() if it.get("status") != "done"]
    except Exception:  # noqa: BLE001
        pending = []
    if pending:
        lines.append("## ⏳ 待 DSH 在电脑上执行的请求（共 %d 条）" % len(pending))
        lines.append("")
        for it in pending:
            lines.append("- **%s**（%s｜任务号 %s，提交于 %s）" % (
                it.get("title", ""), it.get("week", ""), it.get("taskId", ""), it.get("time", "")))
            if it.get("desc"):
                lines.append("  - 说明：%s" % it["desc"])
            lines.append("  - 请求：%s" % it.get("ask", ""))
        lines.append("")
        lines.append("> 给 Agent 的提示：读到这里时，先检查相关命令/环境是否已就绪（例如 `uv --version`、`git --version`），再逐条执行；执行完请提示用户在网站路线图里打勾，或调用 `POST /api/request` 把对应条目标记为 done。")
        lines.append("")

    lines.append("## 各周完成情况")
    lines.append("")
    lines.append("| 周次 | 完成任务数 | 本周年限 | 备注 |")
    lines.append("| --- | --- | --- | --- |")
    listed = 0
    for wk in sorted(weeks.keys(), key=lambda x: (len(x), x)):
        item = weeks[wk]
        done_n = len(item.get("done", []))
        hours = item.get("hours", 0) or 0
        note = (item.get("note") or "").replace("\n", " ")[:60]
        if not done_n and not hours and not note.strip():
            continue  # 空记录不展示
        listed += 1
        lines.append("| %s | %d | %s | %s |" % (wk, done_n, hours or "—", note))
    if not listed:
        lines.append("| — | 0 | — | 还没开始打卡 |")
    lines.append("")

    rounds = progress.get("interview", {}).get("rounds", [])
    lines.append("## 模拟面试记录（最近 10 轮）")
    lines.append("")
    if not rounds:
        lines.append("_暂无记录_")
    else:
        lines.append("| 时间 | 目标单位 | 题数 | 正确/部分/错误 | 得分 | 估计成功率 |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for r in rounds[-10:]:
            lines.append("| %s | %s | %s | %s/%s/%s | %s | %s |" % (
                r.get("time", "—"), r.get("orgType", "—"), r.get("count", "—"),
                r.get("correct", 0), r.get("partial", 0), r.get("wrong", 0),
                r.get("score", "—"), r.get("passRate", "—"),
            ))
    lines.append("")

    weak = progress.get("interview", {}).get("weakCategories", [])
    if weak:
        lines.append("## 薄弱分类（按最近表现排序）")
        lines.append("")
        for w in weak:
            lines.append("- %s：%s" % (w.get("name"), w.get("note", "")))
        lines.append("")

    questions = progress.get("questions", [])
    if questions:
        lines.append("## 学生提交的疑问 / 汇报")
        lines.append("")
        for q in questions[-15:]:
            lines.append("- [%s] %s" % (q.get("time", ""), (q.get("text") or "").replace("\n", " ")[:200]))
        lines.append("")

    resumed = progress.get("resume", {})
    if resumed.get("updatedAt"):
        lines.append("## 简历工坊")
        lines.append("")
        lines.append("- 最近编辑：%s（当前版本：%s）" % (resumed["updatedAt"], resumed.get("version", "—")))
        lines.append("")

    # ---- 持久记忆档案（跨清空对话/重启都在） ----
    mem = load_json(memory_file(), {}) or {}
    if mem:
        lines.append("## 持久记忆档案")
        lines.append("")
        env = mem.get("environment") or load_machine()
        if env:
            lines.append("**当前运行这台机器（全局自动探测，与成员无关）**")
            lines.append("")
            for k, v in env.items():
                if k == "已装工具" and isinstance(v, dict):
                    lines.append("- 已装工具：")
                    for tk, tv in v.items():
                        lines.append("  - %s：%s" % (tk, tv))
                elif isinstance(v, dict):
                    lines.append("- %s：%s" % (k, json.dumps(v, ensure_ascii=False)))
                else:
                    lines.append("- %s：%s" % (k, v))
            lines.append("")
        devices = mem.get("devices") or []
        if devices:
            lines.append("**名下设备清单**")
            lines.append("")
            for d in devices:
                lines.append("- %s｜%s（%s）｜当前：%s" % (
                    d.get("name", ""), d.get("配置", ""), d.get("用途", ""), d.get("当前", "-")))
            lines.append("")
        p = mem.get("profile") or {}
        if p:
            lines.append("**学生画像**")
            lines.append("")
            for k, v in p.items():
                lines.append("- %s：%s" % (k, v))
            lines.append("")
        notes_env = mem.get("environment_notes") or {}
        if notes_env:
            lines.append("**环境补充说明（手工）**")
            lines.append("")
            for k, v in notes_env.items():
                lines.append("- %s：%s" % (k, v))
            lines.append("")
        notes = mem.get("notes") or []
        if notes:
            lines.append("**长期备注**")
            lines.append("")
            for n in notes:
                lines.append("- %s" % n)
            lines.append("")
        mil = mem.get("milestones") or []
        if mil:
            lines.append("**学习里程碑（自动累计）**")
            lines.append("")
            for m in mil[-15:]:
                lines.append("- [%s] %s" % (m.get("time", ""), m.get("text", "")))
            lines.append("")
        wl = mem.get("watchlist") or []
        if wl:
            lines.append("**我的关注清单（%d 项，来自 GitHub 热榜）**" % len(wl))
            lines.append("")
            for x in wl[-30:]:
                lines.append("- [%s｜%s] %s（%s）%s" % (
                    x.get("kind") or "—", x.get("level") or "—", x.get("name"),
                    x.get("lang") or "—", x.get("url") or ""))
                if x.get("why"):
                    lines.append("  - 为什么关注：%s" % x["why"])
            lines.append("")
        faq = mem.get("faq") or []
        if faq:
            lines.append("**疑问与解答记忆（最近 10 条）**")
            lines.append("")
            for item in faq[-10:]:
                lines.append("- [%s] 问：%s" % (item.get("time", ""), str(item.get("q") or "").replace("\n", " ")[:170]))
                ans = str(item.get("a") or "").replace("\n", " ")
                if ans:
                    lines.append("  - 答（摘要）：%s" % ans[:240])
            lines.append("")
        lines.append("- 记忆更新时间：%s" % (mem.get("updatedAt") or "—"))
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("_给 Agent 的提示：读到这里时，请针对「薄弱分类」和最近提问给出具体的下一步建议。_")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    server_version = "AgentHub/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---------------- helpers ---------------- #
    def _send(self, code, body=b"", ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, data, code=200):
        self._send(code, json.dumps(data, ensure_ascii=False), "application/json; charset=utf-8")

    def _auth_ok(self):
        """局域网模式下校验访问令牌；本机模式不校验。"""
        if not ACCESS_TOKEN:
            return True
        tok = self.headers.get("X-Token") or (getattr(self, "qs", {}) or {}).get("k") or ""
        return tok.strip() == ACCESS_TOKEN

    def _need_token(self):
        return self._json({
            "ok": False,
            "error": "需要访问令牌：请用服务器控制台里给出的完整链接打开（形如 http://<局域网IP>:8787/?k=令牌）",
            "needToken": True,
        }, 401)

    def _error(self, msg, code=400):
        self._json({"ok": False, "error": msg}, code)

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise ValueError("请求体过大")
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            raise ValueError("请求体不是合法 JSON")

    # ---------------- routes ---------------- #
    def do_OPTIONS(self):
        self._send(204)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        import urllib.parse as _up  # noqa: PLC0415
        parts = self.path.split("?", 1)
        path = parts[0]
        self.qs = {k: v[0] for k, v in _up.parse_qs(parts[1] if len(parts) > 1 else "").items()}
        set_current_user(self.headers.get("X-User") or self.qs.get("user"))
        if path.startswith("/api/") and path != "/api/health" and not self._auth_ok():
            return self._need_token()
        if path == "/api/health":
            return self._json({"ok": True, "version": "2.0", **public_settings(), "user": public_users()})
        if path == "/api/users":
            return self._json({"ok": True, **public_users()})
        if path == "/api/settings":
            return self._json({"ok": True, **public_settings()})
        if path == "/api/state":
            return self._json({"ok": True, "progress": load_json(progress_file(), {}),
                               "user": public_users()})
        if path == "/api/models":
            ids, err = list_models()
            if err:
                return self._json({"ok": False, "error": err, "models": []})
            return self._json({"ok": True, "models": ids})
        if path == "/api/memory":
            mem = load_json(memory_file(), None)
            if not isinstance(mem, dict):
                mem = ensure_memory()
            mem = dict(mem)
            mem["environment"] = load_machine()      # 全局机器信息（与成员无关）
            return self._json({"ok": True, "memory": mem, "user": public_users()})
        if path == "/api/requests":
            return self._json({"ok": True, "requests": load_requests()})
        if path == "/api/trending":
            window = self.qs.get("window", "week")
            if window not in TRENDING_WINDOWS:
                window = "week"
            ai_filter = self.qs.get("ai") == "1"
            refresh = self.qs.get("refresh") == "1"
            data = load_trending()
            key = trending_key(window, ai_filter)
            entry = data["windows"].get(key)
            fetched_at = data["fetchedAt"].get(key)
            stale = False
            if entry and fetched_at:
                try:
                    t = datetime.strptime(fetched_at, "%Y-%m-%d %H:%M:%S")
                    stale = (datetime.now() - t).total_seconds() > 26 * 3600
                except Exception:
                    stale = False
            err = None
            # 只在「从来没有数据」或用户显式要求时抓取；
            # 日常更新交给服务端每天定时的后台任务，进页面不触发检索。
            if refresh or not entry:
                fetched, err2, _reset = fetch_trending(window, ai_filter)
                if fetched:
                    entry = fetched
                    fetched_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    data["windows"][key] = entry
                    data["fetchedAt"][key] = fetched_at
                    save_json(TRENDING_FILE, data)
                else:
                    err = err2
            return self._json({
                "ok": bool(entry), "error": err, "window": window, "ai": ai_filter,
                "entry": entry, "fetchedAt": fetched_at,
                "analysis": data["analyses"].get(analysis_key(window, ai_filter)),
                "stale": stale,
                "auto": data.get("auto"),
                "nextRun": next_auto_run(data),
                "hasGithubToken": bool(get_settings()["githubToken"]),
                "watchlist": (load_json(memory_file(), {}) or {}).get("watchlist", []),
            })
        if path.startswith("/api/"):
            return self._error("未知接口: " + path, 404)
        return self._serve_static(path)

    def do_POST(self):
        path = self.path.split("?")[0]
        set_current_user(self.headers.get("X-User"))
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(str(e), 400)
        if isinstance(body.get("user"), str) and body.get("user"):
            set_current_user(body["user"])
        if path.startswith("/api/") and path != "/api/health" and not self._auth_ok():
            return self._need_token()

        if path == "/api/users":
            return self._post_users(body)
        if path == "/api/onboarding":
            return self._post_onboarding(body)
        if path == "/api/settings":
            return self._post_settings(body)
        if path == "/api/state":
            return self._post_state(body)
        if path == "/api/chat":
            return self._post_chat(body)
        if path == "/api/grade":
            return self._post_grade(body)
        if path == "/api/image":
            return self._post_image(body)
        if path == "/api/memory":
            return self._post_memory(body)
        if path == "/api/request":
            return self._post_request(body)
        if path == "/api/trending/analyze":
            window = (body.get("window") or "week")
            if window not in TRENDING_WINDOWS:
                window = "week"
            ai_filter = bool(body.get("ai"))
            res, err = analyze_trending(window, ai_filter)
            if err:
                return self._json({"ok": False, "error": err}, 200)
            return self._json({"ok": True, "analysis": res, "window": window, "ai": ai_filter})
        if path == "/api/trending/auto":
            with _lock:
                data = load_trending()
                auto = data.setdefault("auto", {})
                if body.get("hour") is not None:
                    try:
                        auto["hour"] = max(0, min(23, int(body["hour"])))
                    except Exception:
                        pass
                if body.get("analyze") in ("off", "week", "all"):
                    auto["analyze"] = body["analyze"]
                save_json(TRENDING_FILE, data)
            return self._json({"ok": True, "auto": data.get("auto"), "nextRun": next_auto_run(data)})
        if path == "/api/trending/run":
            status = run_daily_trending_update(reason="手动触发")
            data = load_trending()
            return self._json({"ok": True, "status": status, "auto": data.get("auto"),
                               "nextRun": next_auto_run(data)})
        if path == "/api/report":
            return self._post_report(body)
        return self._error("未知接口: " + path, 404)

    # ---------------- static ---------------- #
    def _serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        rel = path.lstrip("/").replace("\\", "/")
        # 不通过网页暴露密钥与进度数据；只放行图片目录
        if rel.startswith("state/") and not rel.startswith("state/images/"):
            return self._error("该文件不通过网页暴露（含密钥/进度数据）", 403)
        target = (ROOT / rel).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            return self._error("非法路径", 403)
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            return self._error("未找到: " + rel, 404)
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json", "image/svg+xml"):
            ctype += "; charset=utf-8"
        with open(target, "rb") as f:
            data = f.read()
        self._send(200, data, ctype)

    # ---------------- api: users ---------------- #
    def _post_users(self, body):
        action = (body.get("action") or "list").strip()
        with _lock:
            data = load_users()
            if action == "create":
                name = _clip(body.get("name"), 40) or "新成员"
                base = re.sub(r"[^a-zA-Z0-9]+", "", str(body.get("slug") or "")) or ""
                slug = base or ("u%d" % (len(data["users"]) + 1))
                existing = {u["slug"] for u in data["users"]}
                i = 2
                while slug in existing:
                    slug = "%s%d" % (base or "u", len(data["users"]) + i)
                    i += 1
                data["users"].append({
                    "slug": slug, "name": name,
                    "emoji": _clip(body.get("emoji"), 4) or "🙂",
                    "primary": False,
                    "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                })
                data["active"] = slug
                save_users(data)
                set_current_user(slug)
                mem = ensure_memory(slug)
                mem["profile"] = dict(mem.get("profile") or {})
                mem["profile"]["称呼"] = name
                save_json(memory_file(slug), mem)
                if not progress_file(slug).exists():
                    save_json(progress_file(slug), {
                        "weeks": {}, "interview": {"rounds": []}, "questions": [],
                        "totalTasks": 0, "totalHours": 0})
            elif action == "rename":
                slug = _clip(body.get("slug"), 40)
                for u in data["users"]:
                    if u["slug"] == slug:
                        if body.get("name"):
                            u["name"] = _clip(body["name"], 40)
                        if body.get("emoji"):
                            u["emoji"] = _clip(body["emoji"], 4)
                save_users(data)
            elif action == "delete":
                slug = _clip(body.get("slug"), 40)
                data["users"] = [u for u in data["users"] if u["slug"] != slug or u.get("primary")]
                if data.get("active") == slug:
                    data["active"] = primary_slug()
                save_users(data)
            elif action == "switch":
                slug = _clip(body.get("slug"), 40)
                if find_user(slug):
                    data["active"] = slug
                    save_users(data)
            return self._json({"ok": True, **public_users(), "active": load_users().get("active")})

    # ---------------- api: onboarding（首次进入的画像问卷） ---------------- #
    def _post_onboarding(self, body):
        slug = _clip(body.get("slug"), 40) or current_slug()
        if not find_user(slug):
            return self._error("成员不存在")
        set_current_user(slug)
        a = body.get("answers") or {}
        if not isinstance(a, dict):
            return self._error("answers 必须是对象")
        with _lock:
            mem = ensure_memory(slug)
            profile = {
                "称呼": _clip(a.get("name"), 40),
                "身份": _clip(a.get("identity"), 120),
                "课题": _clip(a.get("research"), 200),
                "目标岗位": _clip(a.get("target"), 160),
                "求职节点": _clip(a.get("timeline"), 120),
                "每周可投入": _clip(a.get("hours"), 60),
                "编程基础": _clip(a.get("python"), 200),
                "数学与算法": _clip(a.get("math"), 120),
                "优势": _clip(a.get("strengths"), 300),
                "短板": _clip(a.get("weakness"), 300),
                "学习方式偏好": _clip(a.get("style"), 300),
            }
            notes = {
                "电脑环境": _clip(a.get("machine"), 300),
                "已有的工具/技能": _clip(a.get("tools"), 300),
                "目前最大的困扰": _clip(a.get("painpoint"), 300),
                "其他必须记住的": _clip(a.get("mustknow"), 300),
            }
            mem["profile"] = {k: v for k, v in profile.items() if str(v or "").strip()}
            mem["environment_notes"] = {k: v for k, v in notes.items() if str(v or "").strip()}
            dev = _clip(a.get("machine"), 300)
            if dev:
                mem["devices"] = [{
                    "name": _clip(a.get("machineTag"), 60) or "我的电脑",
                    "配置": dev,
                    "用途": _clip(a.get("machineUse"), 200),
                    "当前": "",
                }]
            mem["onboarded"] = True
            ms = mem.setdefault("milestones", [])
            ms.append({"time": datetime.now().strftime("%Y-%m-%d %H:%M"),
                       "text": "完成首次画像问卷：" + (profile.get("目标岗位") or profile.get("身份") or "")[:60]})
            mem["milestones"] = ms[-80:]
            mem["updatedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            save_json(memory_file(slug), mem)
            write_report(slug)

        # 顺便让模型按她的画像重生成一份「近七天」热榜分析（失败不影响保存）
        try:
            refresh_machine()
        except Exception:  # noqa: BLE001
            pass
        return self._json({"ok": True, "memory": mem, "user": public_users()})

    # ---------------- api: settings ---------------- #
    def _post_settings(self, body):
        with _lock:
            s = load_json(SETTINGS_FILE, {})
            # 注意：空的 apiKey 一律视为「不修改」，避免用户只改别的设置时把 Key 清掉。
            # 想清空请显式传 {"clearKey": true}（网页上有「清除 Key」按钮）。
            if body.get("clearKey"):
                s.pop("apiKey", None)
            elif (body.get("apiKey") or "").strip():
                s["apiKey"] = body["apiKey"].strip()
            if (body.get("model") or "").strip():
                s["model"] = body["model"].strip()
            if (body.get("imageModel") or "").strip():
                s["imageModel"] = body["imageModel"].strip()
            if "visionModel" in body:
                s["visionModel"] = (body.get("visionModel") or "").strip()
            if (body.get("githubToken") or "").strip():
                s["githubToken"] = body["githubToken"].strip()
            if body.get("clearGithubToken"):
                s.pop("githubToken", None)
            if (body.get("baseUrl") or "").strip():
                s["baseUrl"] = body["baseUrl"].strip().rstrip("/")
            if body.get("thinking"):
                lvl = str(body["thinking"]).strip().lower()
                if lvl in ("off", "low", "medium", "high"):
                    s["thinking"] = lvl
            if body.get("thinkingBudget") is not None and str(body.get("thinkingBudget")) != "":
                try:
                    s["thinkingBudget"] = max(0, int(body["thinkingBudget"]))
                except Exception:  # noqa: BLE001
                    pass
            if "extraParams" in body:
                extra = body["extraParams"]
                if isinstance(extra, dict) and extra:
                    s["extraParams"] = extra
                else:
                    s.pop("extraParams", None)
            save_json(SETTINGS_FILE, s)
        return self._json({"ok": True, **public_settings()})

    # ---------------- api: state ---------------- #
    def _post_state(self, body):
        progress = body.get("progress")
        if not isinstance(progress, dict):
            return self._error("progress 必须是对象")
        progress["updatedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with _lock:
            save_json(progress_file(), progress)
            try:
                write_report()
            except Exception as e:  # noqa: BLE001
                sys.stderr.write("写进度报告失败: %s\n" % e)
        return self._json({"ok": True, "savedAt": progress["updatedAt"], "report": str(WORKSPACE_REPORT)})

    # ---------------- api: chat ---------------- #
    def _post_chat(self, body):
        messages = body.get("messages")
        if not isinstance(messages, list) or not messages:
            return self._error("messages 不能为空")
        clean = []
        budget = MAX_IMAGES_PER_REQUEST
        for m in messages[-24:]:
            role = m.get("role")
            if role not in ("system", "user", "assistant"):
                continue
            content = clean_content(m.get("content"), budget)
            if isinstance(content, list):
                if not content:
                    continue
                budget -= sum(1 for i in content if isinstance(i, dict) and i.get("type") == "image_url")
            elif not content.strip():
                continue
            clean.append({"role": role, "content": content})
        if not clean:
            return self._error("messages 内容为空")

        s = get_settings()
        with_image = has_image(clean)
        # 带图时如果单独配了视觉模型就用它，否则用主模型（实测 deepseek-v4.1-flash 支持看图）
        model_override = s["visionModel"] if (with_image and s["visionModel"]) else None
        result, err = call_model(clean, temperature=float(body.get("temperature", 0.4)),
                                 thinking=body.get("thinking") or None, model=model_override)
        if err:
            return self._json({"ok": False, "error": err, "needKey": "API Key" in err}, 200)
        return self._json({"ok": True, "content": result["content"], "usage": result.get("usage", {}),
                           "model": result.get("model"), "hadImage": with_image,
                           "reasoningTokens": result.get("reasoningTokens")})

    # ---------------- api: image ---------------- #
    def _post_image(self, body):
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return self._error("缺少 prompt")
        size = (body.get("size") or "1024x1024").strip()
        if "x" not in size:
            size = "1024x1024"
        result, err = generate_image(prompt, size=size, model=body.get("model") or None)
        if err:
            return self._json({"ok": False, "error": err}, 200)
        return self._json({"ok": True, **result})

    # ---------------- api: grade ---------------- #
    def _post_grade(self, body):
        question = (body.get("question") or "").strip()
        user_answer = (body.get("userAnswer") or "").strip()
        points = body.get("answerPoints") or []
        detail = (body.get("answerDetail") or "").strip()
        if not question:
            return self._error("缺少 question")
        if not user_answer:
            return self._json({"ok": True, "graded": False, "reason": "未作答",
                               "score": 0.0, "verdict": "wrong", "comment": "你没有作答这道题。",
                               "hitPoints": [], "missedPoints": points})

        sys_prompt = (
            "你是一位严格但公正的技术面试官。请对考生的回答评分，只输出 JSON。\n"
            "评分标准：\n"
            "- 命中考题的绝大部分关键要点、表述准确 → score 0.9~1.0，verdict=correct\n"
            "- 命中主要要点但有遗漏或小错 → score 0.55~0.85，verdict=partial\n"
            "- 只沾边、答非所问、或存在明显概念错误 → score 0.15~0.5，verdict=partial\n"
            "- 完全不会、空白、胡说 → score 0~0.1，verdict=wrong\n"
            "输出 JSON 字段：score(数字，0~1)、verdict(correct|partial|wrong)、"
            "hitPoints(字符串数组，考生答到的要点)、missedPoints(字符串数组，遗漏的要点)、"
            "comment(80~200字中文点评：先肯定答对的，再指出最关键的一个漏洞，最后给一句改进建议)、"
            "followUp(一个针对该回答的追问，若回答很好则给一个更深的问题)。"
        )
        user_prompt = (
            "【考题】%s\n\n【评分要点】\n%s\n\n【参考答案】\n%s\n\n【考生回答】\n%s\n\n请输出 JSON。"
            % (
                question,
                "\n".join("- " + str(p) for p in points) or "（无）",
                detail or "（无）",
                user_answer,
            )
        )
        s = get_settings()
        grade_thinking = "off" if s["thinking"] == "off" else GRADE_THINKING
        result, err = call_model(
            [{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.2, json_mode=True, thinking=grade_thinking,
        )
        if err:
            return self._json({"ok": False, "error": err, "needKey": "API Key" in err}, 200)

        data = extract_json(result["content"]) or {}
        try:
            score = float(data.get("score", 0))
        except Exception:
            score = 0.0
        score = max(0.0, min(1.0, score))
        verdict = data.get("verdict") or ("correct" if score >= 0.9 else "partial" if score >= 0.5 else "wrong")
        if verdict not in ("correct", "partial", "wrong"):
            verdict = "partial"
        return self._json({
            "ok": True, "graded": True, "score": round(score, 2), "verdict": verdict,
            "hitPoints": data.get("hitPoints") or [],
            "missedPoints": data.get("missedPoints") or points,
            "comment": data.get("comment") or "",
            "followUp": data.get("followUp") or "",
            "usage": result.get("usage", {}),
            "reasoningTokens": result.get("reasoningTokens"),
        })

    # ---------------- api: report ---------------- #
    def _post_memory(self, body):
        """持久记忆档案：跨清空对话 / 重启网站 / 换浏览器都不会丢。"""
        with _lock:
            mem = load_json(memory_file(), None)
            if not isinstance(mem, dict) or not mem:
                mem = ensure_memory()
            action = (body.get("action") or "append").strip()

            if action == "clear_all":
                mem = default_memory()
                mem["onboarded"] = True
            elif action == "refresh_env":
                # 手动刷新全局机器信息 + 本成员的设备「当前」标记
                try:
                    env = refresh_machine()
                    is_laptop = "笔记本" in str(env.get("机型", ""))
                    for d in mem.get("devices", []):
                        if not isinstance(d, dict):
                            continue
                        if "笔记本" in str(d.get("name") or "") and is_laptop:
                            d["当前"] = "✅ 是"
                            d["配置"] = "本次探测：" + " / ".join(filter(None, [
                                env.get("CPU"), env.get("内存"), env.get("GPU"), env.get("磁盘")]))
                except Exception as e:  # noqa: BLE001
                    return self._json({"ok": False, "error": "刷新失败：%s" % e}, 200)
            elif action == "clear_faq":
                mem["faq"] = []
            elif action == "clear_milestones":
                mem["milestones"] = []
            else:
                # profile / environment_notes 采用「整份替换」语义：
                # 前端每次都会提交完整字典，这样页面上删除条目才真的生效。
                if isinstance(body.get("profile"), dict):
                    newp = {}
                    for k, v in body["profile"].items():
                        k2 = _clip(k, 60)
                        if k2:
                            newp[k2] = _clip(v, 400)
                    mem["profile"] = newp
                if isinstance(body.get("environment_notes"), dict):
                    newn = {}
                    for k, v in body["environment_notes"].items():
                        k2 = _clip(k, 60)
                        if k2:
                            newn[k2] = _clip(v, 400)
                    mem["environment_notes"] = newn
                if isinstance(body.get("devices"), list):
                    cleaned = []
                    for d in body["devices"][:10]:
                        if not isinstance(d, dict):
                            continue
                        cleaned.append({
                            "name": _clip(d.get("name"), 60),
                            "配置": _clip(d.get("配置"), 300),
                            "用途": _clip(d.get("用途"), 300),
                            "当前": _clip(d.get("当前"), 20),
                        })
                    if cleaned:
                        mem["devices"] = cleaned
            if isinstance(body.get("notes"), list):
                mem["notes"] = [_clip(n, 400) for n in body["notes"] if str(n or "").strip()][:40]
            if isinstance(body.get("principles"), list):
                mem["principles"] = [str(x)[:300] for x in body["principles"][:40] if str(x).strip()]
            for item in (body.get("faqAppend") or [])[:10]:
                if not isinstance(item, dict):
                    continue
                q = _clip(item.get("q"), 900)
                if not q:
                    continue
                mem.setdefault("faq", []).append({
                    "time": _clip(item.get("time") or datetime.now().strftime("%Y-%m-%d %H:%M"), 30),
                    "topic": _clip(item.get("topic"), 200),
                    "q": q,
                    "a": _clip(item.get("a"), 4000),
                })
                mem["faq"] = (mem.get("faq") or [])[-120:]

            # 里程碑：只保留最近 80 条
            for item in (body.get("milestoneAppend") or [])[:10]:
                if not isinstance(item, dict):
                    continue
                text = _clip(item.get("text"), 500)
                if not text:
                    continue
                mem.setdefault("milestones", []).append({
                    "time": _clip(item.get("time") or datetime.now().strftime("%Y-%m-%d %H:%M"), 30),
                    "text": text,
                })
                mem["milestones"] = (mem.get("milestones") or [])[-80:]

            # 关注清单：加 / 删 / 整份替换
            wl = body.get("watchlistAdd")
            if isinstance(wl, dict):
                name = _clip(wl.get("name"), 120)
                if name:
                    cur = [x for x in (mem.get("watchlist") or [])
                           if isinstance(x, dict) and str(x.get("name")) != name]
                    cur.append({
                        "name": name,
                        "url": _clip(wl.get("url"), 400),
                        "level": _clip(wl.get("level"), 20),
                        "kind": _clip(wl.get("kind"), 20),
                        "why": _clip(wl.get("why"), 600),
                        "lang": _clip(wl.get("lang"), 20),
                        "stars": int(wl.get("stars") or 0),
                        "addedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    })
                    mem["watchlist"] = cur[-80:]
            if body.get("watchlistRemove"):
                target = str(body.get("watchlistRemove"))
                mem["watchlist"] = [x for x in (mem.get("watchlist") or [])
                                    if not (isinstance(x, dict) and str(x.get("name")) == target)]
            if isinstance(body.get("watchlist"), list):
                clean = []
                for x in body["watchlist"][:80]:
                    if not isinstance(x, dict):
                        continue
                    n = _clip(x.get("name"), 120)
                    if not n:
                        continue
                    clean.append({
                        "name": n,
                        "url": _clip(x.get("url"), 400),
                        "level": _clip(x.get("level"), 20),
                        "kind": _clip(x.get("kind"), 20),
                        "why": _clip(x.get("why"), 600),
                        "lang": _clip(x.get("lang"), 20),
                        "stars": int(x.get("stars") or 0),
                        "addedAt": _clip(x.get("addedAt"), 30),
                    })
                mem["watchlist"] = clean

            mem["updatedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            save_json(memory_file(), mem)
        try:
            write_report()
        except Exception:  # noqa: BLE001
            pass
        return self._json({"ok": True, "memory": mem})


def main():
    global ACCESS_TOKEN
    ap = argparse.ArgumentParser(description="AI Agent 学习中枢 · 本地服务")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--lan", action="store_true",
                    help="局域网共享模式：监听 0.0.0.0 并启用访问令牌")
    ap.add_argument("--no-token", action="store_true", help="局域网模式下也不要求令牌（不推荐）")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    if args.lan:
        args.host = "0.0.0.0"
        if not args.no_token:
            ACCESS_TOKEN = load_or_create_token()

    ensure_dirs()
    migrate_to_multi_user()
    refresh_machine()
    users = load_users()["users"]
    for u in users:
        set_current_user(u["slug"])
        ensure_memory(u["slug"])
        if not progress_file(u["slug"]).exists():
            save_json(progress_file(u["slug"]), {
                "weeks": {}, "interview": {"rounds": []}, "questions": [],
                "totalTasks": 0, "totalHours": 0})
        write_report(u["slug"])
    set_current_user(primary_slug())

    url = "http://%s:%d/" % (args.host, args.port)
    if args.lan:
        if ACCESS_TOKEN:
            url = "http://127.0.0.1:%d/?k=%s" % (args.port, ACCESS_TOKEN)
        else:
            url = "http://127.0.0.1:%d/" % args.port
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print("=" * 62)
    print("  AI Agent 学习中枢已启动（多成员版）")
    print("  本机打开：%s" % url)
    if args.lan:
        ips = lan_ips()
        if ips:
            print("  " + "-" * 58)
            print("  ★ 让别人的电脑访问（同一个 WiFi / 同一个办公网）：")
            for ip in ips:
                if ACCESS_TOKEN:
                    print("      http://%s:%d/?k=%s" % (ip, args.port, ACCESS_TOKEN))
                else:
                    print("      http://%s:%d/" % (ip, args.port))
            print("  ★ 上面链接必须带 ?k=令牌，否则 /api 会拒绝")
            print("  令牌文件：%s" % TOKEN_FILE)
            print("  " + "-" * 58)
        else:
            print("  ⚠️ 没有检测到局域网地址（可能没连网），只能用本机打开。")
    print("  成员：%s" % "、".join("%s(%s)" % (u.get("name"), u["slug"]) for u in users))
    print("  数据目录：%s" % USERS_DIR)
    print("  主成员报告：%s" % WORKSPACE_REPORT)
    s = public_settings()
    print("  模型 Key：%s" % ("已配置（%s）" % s["keySource"] if s["hasKey"] else "未配置（可在网页右上角设置）"))
    print("  停止服务：Ctrl + C")
    print("=" * 62)

    try:
        threading.Thread(target=trending_scheduler, daemon=True).start()
        auto = load_trending().get("auto") or {}
        print("  GitHub 热榜：每天 %02d:00 自动更新，分析范围=%s（上次：%s）" % (
            int(auto.get("hour", TRENDING_DEFAULT_HOUR)), auto.get("analyze", TRENDING_DEFAULT_ANALYZE),
            auto.get("lastRun") or "尚未执行"))
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("热榜定时任务启动失败：%s\n" % e)

    # 隐藏窗口启动时看不到控制台，把访问链接落盘
    try:
        out = ["# AI Agent 学习中枢 · 访问链接", "",
               "生成时间：%s" % datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "",
               "本机（你这台电脑）：%s" % url]
        if args.lan:
            for ip in (lan_ips() or []):
                if ACCESS_TOKEN:
                    out.append("局域网（别人的电脑，需同一网络）：http://%s:%d/?k=%s" % (ip, args.port, ACCESS_TOKEN))
                else:
                    out.append("局域网：http://%s:%d/" % (ip, args.port))
        out += ["", "成员：%s" % "、".join(u.get("name", "") for u in users)]
        (STATE_DIR / "access-links.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("写访问链接文件失败：%s\n" % e)

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
