# -*- coding: utf-8 -*-
"""deploy_v5: 按插件作用域部署 + 陈旧树防护。

用法:
  python deploy_v5.py --scope <plugin>            # 只部署该插件相关产物
  python deploy_v5.py --scope all                 # 全量(默认行为)
  python deploy_v5.py --force                     # 跳过陈旧检查

scope 取值: all | shell | execution-center | observation-center |
            virtual-showroom | skill-center | orchestration-center

规则(全局记忆):
  1. 部署前必须 git fetch + 比较 HEAD..origin/main, 落后则中止(除非 --force)。
  2. 只上传"本次修改插件"相关的产物; 其他插件的产物一律跳过(md5 相同或路径不在作用域)。
  3. bundle 插件按目录隔离(public/plugins/<name>/), source 插件共享 shell 与语言块,
     因此 source 插件部署前必须保证本地树已与 origin/main 同步。
"""
import argparse
import hashlib
import re
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
REPO = Path(r"D:\OpenAN\github\openan-portal")
PORTAL = REPO / "portal"
DIST = PORTAL / "dist"
WEB = "/OpenA2A-T/openan-portal-frontend"

ap = argparse.ArgumentParser()
ap.add_argument("--scope", default="all")
ap.add_argument("--force", action="store_true")
args = ap.parse_args()
SCOPE = args.scope

BUNDLE_DIRS = {"observation-center", "virtual-showroom", "skill-center", "orchestration-center"}


def git(args):
    r = subprocess.run(["git"] + args, capture_output=True, text=False, cwd=REPO)
    return ((r.stdout or b"") + (r.stderr or b"")).decode("utf-8", "replace")


def md5(p):
    return hashlib.md5(Path(p).read_bytes()).hexdigest()


# ── 1. 陈旧树防护 ──
print("== 陈旧检查 (git fetch origin main) ==")
git(["fetch", "origin", "main"])
behind = git(["rev-list", "--count", "HEAD..origin/main"]).strip()
print("  HEAD..origin/main =", behind or "0", "commits behind")
if behind and behind != "0" and not args.force:
    print("✗✗ 本地树落后主线", behind, "个提交 — 部署将回退其他插件！")
    print("   请先: git merge origin/main (解决冲突后重试), 或 --force 跳过。")
    sys.exit(2)
if args.force:
    print("  (--force 跳过陈旧检查)")

# ── 2. 收集 dist 文件并按作用域过滤 ──
def in_scope(rel):
    if SCOPE == "all":
        return True
    # bundle 插件目录
    m = re.match(r"public/plugins/([^/]+)/", rel)
    if m:
        return m.group(1) == SCOPE
    # shell 核心 (index.html + shell chunk)
    if rel == "index.html" or rel.startswith("assets/index-"):
        return SCOPE in ("all", "shell") or True  # shell 随任何 source 插件一起走
    # source 插件: manifest chunk / src chunk / 语言块
    if rel.startswith("assets/plugin.manifest-") or rel.startswith("assets/src-"):
        return SCOPE not in (None,) and (SCOPE in ("all", "shell") or SCOPE not in BUNDLE_DIRS)
    if rel.startswith("assets/zh-") or rel.startswith("assets/en-"):
        return True  # 语言块: 陈旧检查已保证树是新的 → 安全
    if rel.startswith("assets/layers-") or rel.startswith("assets/openan-logo") or rel.startswith("assets/react-"):
        return True
    return SCOPE == "all"


files = [DIST / "index.html"] + sorted((DIST / "assets").iterdir())
pub = DIST / "public"
if pub.exists():
    for p in sorted(pub.rglob("*")):
        if p.is_file():
            files.append(p)

upload = []
skipped_scope = []
for lp in files:
    rel = str(lp.relative_to(DIST)).replace("\\", "/")
    if not in_scope(rel):
        skipped_scope.append(rel)
        continue
    rp = f"{WEB}/{rel}"
    upload.append((lp, rp, rel))

# ── 3. 连接 + md5 差异上传 ──
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("47.236.98.226", 22, username="root", password="adn_1234567890_", look_for_keys=False, allow_agent=False)
TS = time.strftime("%Y%m%d-%H%M%S")
def run(cmd, t=300):
    _, o, e = c.exec_command(cmd, timeout=t)
    return o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")


run(f"cp -a {WEB}/index.html {WEB}/index.html.bak-v5-{TS}")
sftp = c.open_sftp()
print(f"== 上传 (scope={SCOPE}, 候选 {len(upload)}) ==")
put_n = skip_n = 0
for lp, rp, rel in upload:
    try:
        with sftp.open(rp, "rb") as f:
            same = hashlib.md5(f.read()).hexdigest() == md5(lp)
    except (FileNotFoundError, IOError):
        same = False
    if same:
        skip_n += 1
        continue
    sftp.put(str(lp), rp + ".uploading")
    run(f"mv {rp}.uploading {rp}")
    put_n += 1
    print(f"  PUT  {rel}  ({lp.stat().st_size:,} B)")
sftp.close()
print(f"== 汇总: PUT {put_n} / SKIP {skip_n} / 作用域外 {len(skipped_scope)} ==")
print(f"== 验证 ==")
sh = run("curl -s http://127.0.0.1:9003/ | grep -oE 'assets/index-[A-Za-z0-9_-]+[.]js' | head -1").strip()
print("served shell:", sh)
print("holes(',,'):", run(f"curl -s http://127.0.0.1:9003/{sh}" + " | grep -c ',,'").strip() or "0")
print(f"DONE — rollback: cp {WEB}/index.html.bak-v5-{TS} {WEB}/index.html")
c.close()
