#!/usr/bin/env bash
# ============================================================================
# OpenAN Portal 一键部署脚本（中文版）
#
# 用法:
#   sudo bash deploy-zh.sh [WEB_ROOT] [PORT1] [PORT2]
#
#   WEB_ROOT     部署目录                    (默认 /OpenA2A-T/openan-portal-frontend)
#   PORT1/PORT2  nginx 监听端口              (默认 9003 3003)
#
# 英文版请使用同目录下的 deploy-en.sh。
# 部署方式为叠加式: 旧 hash chunk 保留, 部署前打开的浏览器会话平滑过渡。
# ============================================================================
set -euo pipefail

WEB_ROOT="${1:-/OpenA2A-T/openan-portal-frontend}"
PORT1="${2:-9003}"
PORT2="${3:-3003}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/deploy-common.sh"
validate_deploy_args
TARBALL="$SCRIPT_DIR/openan-portal-dist.tar.gz"
NGINX_CONF_SRC="$SCRIPT_DIR/openan-portal.nginx.conf"
NGINX_CONF_DST="/etc/nginx/conf.d/openan-portal.conf"
TS=$(date +%Y%m%d%H%M%S)
BACKUP="${WEB_ROOT}.bak-${TS}"

# ---------------- 1/5 备份 ----------------
# 备份用 cp 而非 mv: 旧 hash 命名的 chunk 需留在 web root,
# 让部署前打开的浏览器会话(SPA 懒加载旧 chunk)平滑过渡。
echo "== 1/5 备份旧目录 =="
OVERLAY=0
if [ -d "$WEB_ROOT" ]; then
    OVERLAY=1
    cp -a "$WEB_ROOT" "$BACKUP"
    echo "   旧目录已复制备份至: $BACKUP"
else
    echo "   无旧部署，跳过备份"
fi

# ---------------- 2/5 解压(叠加) ----------------
if [ ! -f "$TARBALL" ]; then
    echo "ERROR: 发布包不存在: $TARBALL"
    exit 1
fi
echo "== 2/5 解压新版本(叠加，保留旧 chunk) =="
mkdir -p "$WEB_ROOT"
tar -xzf "$TARBALL" -C "$WEB_ROOT"
FILE_COUNT=$(find "$WEB_ROOT" -type f | wc -l)
echo "   已部署到: $WEB_ROOT ($FILE_COUNT 个文件)"
if [ "$OVERLAY" = "1" ]; then
    echo "   提示: 历史 chunk 持续累积，可定期清理 30 天前文件:"
    echo "        find $WEB_ROOT/assets -type f -mtime +30 -delete"
fi

# ---------------- 3/5 安装 nginx 配置 ----------------
if [ ! -f "$NGINX_CONF_SRC" ]; then
    echo "ERROR: nginx 配置模板不存在: $NGINX_CONF_SRC"
    exit 1
fi
echo "== 3/5 安装 nginx 配置 (listen $PORT1 / $PORT2) =="
render_nginx > "$NGINX_CONF_DST"
echo "   已写入: $NGINX_CONF_DST"

# ---------------- 4/5 校验并重载 ----------------
echo "== 4/5 nginx 校验并重载 =="
nginx -t
systemctl reload nginx 2>/dev/null || nginx -s reload

# ---------------- 5/5 自检 ----------------
echo "== 5/5 自检 =="
sleep 1
FAIL=0
for p in "$PORT1" "$PORT2"; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/" 2>/dev/null || echo ERR)
    echo "   portal on :$p -> $CODE"
    [ "$CODE" = "200" ] || FAIL=1
done
JS=$(grep -oE '/assets/index-[^"]+\.js' "$WEB_ROOT/index.html" | head -1)
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT1$JS" 2>/dev/null || echo ERR)
echo "   主包 $JS -> $CODE"
[ "$CODE" = "200" ] || FAIL=1
check_plugins || FAIL=1

echo ""
if [ "$FAIL" = "0" ]; then
    echo "✅ 部署完成，全部自检通过。"
else
    echo "⚠️ 部署完成，但部分自检未通过，请检查上方输出。"
fi
echo "回滚方式: rm -rf $WEB_ROOT && cp -a $BACKUP $WEB_ROOT && nginx -s reload"
[ "$FAIL" = "0" ]
