#!/usr/bin/env bash
# ============================================================================
# OpenAN Portal one-click deployment script (English)
#
# Usage:
#   sudo bash deploy-en.sh [WEB_ROOT] [PORT1] [PORT2]
#
#   WEB_ROOT     deployment web root         (default /OpenA2A-T/openan-portal-frontend)
#   PORT1/PORT2  nginx listen ports          (default 9003 3003)
#
# For Chinese output use deploy-zh.sh in the same directory.
# Deployment is OVERLAY mode: old hash-named chunks are kept so browser
# sessions opened before the deploy keep working.
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

# ---------------- 1/5 backup ----------------
# Backup COPIES instead of MOVES: old hash-named chunks must stay in the
# web root so browser sessions opened before the deploy (which lazy-load
# the old chunks) keep working.
echo "== 1/5 Backing up existing deployment =="
OVERLAY=0
if [ -d "$WEB_ROOT" ]; then
    OVERLAY=1
    cp -a "$WEB_ROOT" "$BACKUP"
    echo "   Existing deployment copied to: $BACKUP"
else
    echo "   No existing deployment, skip backup"
fi

# ---------------- 2/5 extract (overlay) ----------------
if [ ! -f "$TARBALL" ]; then
    echo "ERROR: release tarball not found: $TARBALL"
    exit 1
fi
echo "== 2/5 Extracting new release (overlay, old chunks kept) =="
mkdir -p "$WEB_ROOT"
tar -xzf "$TARBALL" -C "$WEB_ROOT"
FILE_COUNT=$(find "$WEB_ROOT" -type f | wc -l)
echo "   Deployed to: $WEB_ROOT ($FILE_COUNT files)"
if [ "$OVERLAY" = "1" ]; then
    echo "   Note: stale chunks accumulate over time; periodically clean files older than 30 days:"
    echo "         find $WEB_ROOT/assets -type f -mtime +30 -delete"
fi

# ---------------- 3/5 nginx config ----------------
if [ ! -f "$NGINX_CONF_SRC" ]; then
    echo "ERROR: nginx conf template not found: $NGINX_CONF_SRC"
    exit 1
fi
echo "== 3/5 Installing nginx config (listen $PORT1 / $PORT2) =="
render_nginx > "$NGINX_CONF_DST"
echo "   Written to: $NGINX_CONF_DST"

# ---------------- 4/5 validate & reload ----------------
echo "== 4/5 Validating and reloading nginx =="
nginx -t
systemctl reload nginx 2>/dev/null || nginx -s reload

# ---------------- 5/5 self check ----------------
echo "== 5/5 Self check =="
sleep 1
FAIL=0
for p in "$PORT1" "$PORT2"; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/" 2>/dev/null || echo ERR)
    echo "   portal on :$p -> $CODE"
    [ "$CODE" = "200" ] || FAIL=1
done
JS=$(grep -oE '/assets/index-[^"]+\.js' "$WEB_ROOT/index.html" | head -1)
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT1$JS" 2>/dev/null || echo ERR)
echo "   main bundle $JS -> $CODE"
[ "$CODE" = "200" ] || FAIL=1
check_plugins || FAIL=1

echo ""
if [ "$FAIL" = "0" ]; then
    echo "✅ Deployment finished, all self checks passed."
else
    echo "⚠️ Deployment finished, but some self checks FAILED, see output above."
fi
echo "Rollback: rm -rf $WEB_ROOT && cp -a $BACKUP $WEB_ROOT && nginx -s reload"
[ "$FAIL" = "0" ]
