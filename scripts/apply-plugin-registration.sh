#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Legacy prebuilt-package compatibility only. Prefer rebuilding from
# portal/bundled-plugins.json; never depend on a minifier's variable name.
# 旧制品兼容入口；正常发布应修改 JSON 清单后重建。
# Usage: bash apply-plugin-registration.sh [WEB_ROOT] [APP_URL]
set -euo pipefail
python3 - "${1:-/OpenA2A-T/openan-portal-frontend}" "${2:-}" <<'PY'
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from urllib.parse import urlsplit

# A redirected Windows console may default to cp1252; bilingual output must
# not turn an otherwise successful deployment update into a process failure.
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

root = Path(sys.argv[1]).resolve()
app_url = sys.argv[2]
index = root / 'index.html'
index_src = index.read_text(encoding='utf-8')
references = re.findall(r'\bsrc=["\'](/assets/index-[A-Za-z0-9_-]+\.js)["\']', index_src)
if len(references) != 1:
    raise SystemExit('ERROR: expected one main /assets/index-*.js reference')
main = (root / references[0].lstrip('/')).resolve()
if not main.is_relative_to(root):
    raise SystemExit('ERROR: main bundle escapes deployment root')
src = main.read_text(encoding='utf-8')


def field(obj, name):
    match = re.search(r'(?<!\w)["\'`]?' + name + r'["\'`]?\s*:\s*(["\'`])([^"\'`]+)\1', obj)
    return match.group(2) if match else None


# Recognize only a flat, canonical bundle registry. Unknown builds fail closed.
# Supports the old backtick form and current quoted JSON-derived builds.
candidates = []
for match in re.finditer(r'\[(?:\s*\{[^{}]*\}\s*,?)*\s*\]', src):
    objects = re.findall(r'\{[^{}]*\}', match.group())
    ids = [field(obj, 'id') for obj in objects]
    if {'registry-center', 'orchestration-center'} <= set(ids):
        if all(field(obj, 'mode') == 'bundle' and field(obj, 'entry') == '/plugins/' + str(plugin_id)
               for obj, plugin_id in zip(objects, ids)):
            candidates.append((match, objects, ids))
if len(candidates) != 1:
    raise SystemExit('ERROR: ambiguous or unknown bundle registry; rebuild from source')
match, objects, ids = candidates[0]
if len(ids) != len(set(ids)):
    raise SystemExit('ERROR: duplicate plugin ids; rebuild from source')
objects = [obj for obj, plugin_id in zip(objects, ids) if plugin_id != 'ontology-demo']
bundles = ('observation-center', 'virtual-showroom', 'an-ontology')
for plugin_id in bundles:
    if plugin_id not in ids:
        objects.append(json.dumps({'id': plugin_id, 'mode': 'bundle', 'entry': '/plugins/' + plugin_id,
                                   'enabled': True}, separators=(',', ':')))
if len(objects) != len(ids) or any(plugin_id not in ids for plugin_id in bundles):
    new_src = src[:match.start()] + '[' + ','.join(objects) + ']' + src[match.end():]
else:
    new_src = src
new_src = new_src.replace('"Observation Center":`可观测中心`', '"Observation Center":`观测中心`')

new_index = index_src
if app_url:
    parsed = urlsplit(app_url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise SystemExit('ERROR: APP_URL must be an HTTP(S) URL without credentials')
    # JSON escaping plus '<' escaping prevents breaking out of the script tag.
    value = json.dumps(app_url, ensure_ascii=False).replace('<', '\\u003c')
    line = '<script id="openan-ontology-app-url">window.__OPENAN_ONTOLOGY_APP_URL__=' + value + ';</script>'
    existing = r'<script\b[^>]*>[^<]*__OPENAN_ONTOLOGY_APP_URL__[^<]*</script>'
    if re.search(existing, index_src):
        new_index = re.sub(existing, lambda _: line, index_src)
    elif '</head>' in index_src:
        new_index = index_src.replace('</head>', line + '\n</head>', 1)
    else:
        raise SystemExit('ERROR: no head element for APP_URL configuration')


def atomic_write(path, content):
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='', dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
    try:
        os.chmod(temporary, stat.S_IMODE(path.stat().st_mode))
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


changes = [(path, old, new) for path, old, new in ((main, src, new_src), (index, index_src, new_index)) if old != new]
for path, old, _ in changes:
    backup = path.with_name(path.name + '.bak-plugins')
    try:
        with backup.open('x', encoding='utf-8', newline='') as stream:
            stream.write(old)
    except FileExistsError:
        pass  # Never overwrite an earlier recovery copy.
written = []
try:
    for path, old, new in changes:
        atomic_write(path, new)
        written.append((path, old))
except BaseException:
    for path, old in reversed(written):
        atomic_write(path, old)
    raise
print('Plugin registration ready / 插件注册就绪: ' + ', '.join(bundles))
print('Changed files / 修改文件: ' + str(len(changes)))
print('Legacy artifact patch only; rebuild and validate all enabled artifacts before release.')
PY
