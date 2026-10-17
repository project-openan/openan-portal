#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Sourced by both variants; never starts deployment on its own.
validate_deploy_args() {
    [[ "$WEB_ROOT" =~ ^/[a-zA-Z0-9_./\ -]+$ ]] && [[ "$WEB_ROOT" != *'/../'* && "$WEB_ROOT" != */.. ]] || {
        echo 'ERROR: WEB_ROOT must be an absolute, literal directory path'; return 1;
    }
    WEB_ROOT="$(realpath -m -- "$WEB_ROOT")"
    [[ "$WEB_ROOT" != / && "$WEB_ROOT" != /home && "$WEB_ROOT" != /root && "$WEB_ROOT" != /etc && "$WEB_ROOT" != /usr ]] || {
        echo 'ERROR: unsafe WEB_ROOT'; return 1;
    }
    local port
    for port in "$PORT1" "$PORT2"; do
        [[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port > 0 && 10#$port <= 65535)) || {
            echo 'ERROR: port must be in 1..65535'; return 1;
        }
    done
    PORT1=$((10#$PORT1))
    PORT2=$((10#$PORT2))
    [[ "$PORT1" != "$PORT2" ]] || { echo 'ERROR: ports must differ'; return 1; }
}

render_nginx() {
    sed -e "s/__PORT1__/$PORT1/g" -e "s/__PORT2__/$PORT2/g" -e "s|__WEB_ROOT__|$WEB_ROOT|g" "$NGINX_CONF_SRC"
}

check_plugins() {
    [[ -f "$WEB_ROOT/plugins.enabled" && -f "$WEB_ROOT/plugins.release.json" ]] || {
        echo 'ERROR: missing validated release inventory; use npm run build:release'; return 1;
    }
    local plugin code failed=0
    while IFS= read -r plugin; do
        [[ -z "$plugin" ]] && continue
        [[ "$plugin" =~ ^[a-z0-9-]+$ ]] || return 1
        code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT1/plugins/$plugin/plugin.manifest.json") || code=ERR
        echo "   plugin $plugin -> $code"
        [[ "$code" == 200 ]] || failed=1
    done < "$WEB_ROOT/plugins.enabled"
    return "$failed"
}
