# OpenAN Portal Standalone Deployment Package

> Chinese documentation: [README-DEPLOY.md](./README-DEPLOY.md) / 中文版部署文档见同目录

This package contains the **production build artifacts** of OpenAN Portal (the pluggable unified portal) and one-click deployment scripts, ready to deploy standalone on any fresh server.

- Build from reviewed source and independently built component artifacts. A historical deployment is not validation of the current revision.
- Enabled bundle plugins are declared in `portal/bundled-plugins.json`.

## Package Contents

| File | Description |
|---|---|
| `openan-portal-dist.tar.gz` | Portal production build (index.html + assets/ + plugins/) |
| `deploy-zh.sh` | One-click deploy script (Chinese output): copy-backup → overlay extract → install nginx config → self-check |
| `deploy-en.sh` | One-click deploy script (English output) |
| `deploy-common.sh` | Shared argument validation, template rendering and inventory-based checks; upload with both scripts |
| `apply-plugin-registration.sh` | Compatibility tool for older prebuilt packages; requires Python 3.9+ |
| `openan-portal.nginx.conf` | nginx config template (ports parametrizable) |
| `README-DEPLOY-EN.md` | This document |

## Prerequisites (target server)

1. **nginx** (`apt install nginx` or `yum install nginx`)
2. **Backend services** (Portal is a pure frontend + gateway; business data comes from the backends below — deploy as needed):

| Gateway path | Upstream | Description |
|---|---|---|
| `/api/orchestrate/`, `/rest/v1/orchestrate/` | `127.0.0.1:5001` | Orchestration Center FastAPI |
| `/api/registry-center/`, `/api/registry/` | `127.0.0.1:5000` | Registry Center FastAPI |

> Without backends the Portal still opens; the corresponding plugin panels just show empty data / errors. Deploying the Orchestration backend (5001) alone enables "Orchestration Center + Execution Center".

3. **Firewall / security group**: open the Portal port (default 9003).

## Deployment Steps (target server)

```bash
# 1. Upload the whole directory to the target server, e.g. /tmp/openan-portal-release/
scp -r portal-release/ user@<server>:/tmp/openan-portal-release/

# 2. Run on the target server (deploys to /OpenA2A-T/openan-portal-frontend, ports 9003+3003 by default)
sudo bash /tmp/openan-portal-release/deploy-en.sh    # English output
sudo bash /tmp/openan-portal-release/deploy-zh.sh    # 中文提示

# Custom path and ports (both scripts take identical arguments):
sudo bash deploy-en.sh /data/openan-portal-frontend 8080 8081
```

The script automatically: copies a backup of the old directory (keeping old chunks so open browser sessions transition smoothly) → **overlay**-extracts the new build → generates the nginx config → validates with `nginx -t` → reloads → self-checks page / main bundle / plugin manifests.

## Post-deployment Verification

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9003/                      # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9003/plugins/registry-center/plugin.manifest.json   # expect 200
curl -s http://127.0.0.1:9003/api/orchestrate/rest/v1/orchestrate/workflows          # expect JSON (needs the Orchestration backend)
```

Open `http://<server-ip>:9003/` in a browser. The default bundle plugins are Registry Center, Orchestration Center, Observation Center, Virtual Showroom and AN Ontology; Execution Center and Skill Center are built in. Deliver every enabled artifact. Skill Center is marked as demo data. The obsolete `ontology-demo` must not be re-registered.

## Rollback

```bash
rm -rf /OpenA2A-T/openan-portal-frontend && cp -a /OpenA2A-T/openan-portal-frontend.bak-<timestamp> /OpenA2A-T/openan-portal-frontend && nginx -s reload
```

> Deployment is **overlay mode**: old hash-named chunks stay in the web root so browser sessions opened before the deploy transition smoothly; stale files accumulate over time and can be cleaned periodically (the script prints the cleanup command when it finishes).

## Rebuild from Source (optional)

```bash
git clone <openan-portal repository> && cd openan-portal
npm ci
# Build independently in each component project, then install its dist-plugin:
npm run plugins:install -- registry-center=../registry-center/registry-center-web/dist-plugin orchestration-center=../orchestration-center/workflow-designer/dist-plugin
npm run plugins:install -- virtual-showroom=../openan-demo/portal-plugins/virtual-showroom/dist-plugin
npm run integrations:build
# Set appUrl in integrations/dist-plugin/an-ontology/config.json to the editor's public dedicated origin root.
npm run plugins:install -- observation-center=integrations/dist-plugin/observation-center an-ontology=integrations/dist-plugin/an-ontology
npm run build:release
# portal/dist/plugins.release.json records versions and hashes for all assets.
# Package portal/dist/ as openan-portal-dist.tar.gz with the deployment scripts.
```

`npm run build` builds the shell, not a complete release. Release and Docker builds require every enabled bundle; missing artifacts fail rather than silently disabling a plugin. For a reduced delivery, explicitly edit the JSON registry and rebuild. Remote runtime bundles need separate delivery verification.

Set `OBSERVATION_URL` for dev/preview (default `http://127.0.0.1:5002`); containers also accept `OBSERVATION_HOST/PORT/SCHEME`. Adjust standalone Nginx's target separately. Deploy the native T-Box service and configure its browser-reachable dedicated origin root; HTTPS Portal requires an HTTPS editor. See [adapter setup](../integrations/README.md) for access control, embedding policy and verification boundaries.

Installation copies and hashes auxiliary files such as `cards.json`, images and JS chunks, and rejects symlinks and non-public files. Upload `deploy-common.sh` with both language scripts; checks use the generated `plugins.enabled` inventory.

Legacy compatibility: `bash apply-plugin-registration.sh WEB_ROOT [APP_URL]` restores missing registrations and optionally configures an HTTP(S) AN Ontology URL. It is idempotent, preserves `.bak-plugins` recovery copies, and rejects unknown or ambiguous builds without changing deployed files. It does not install artifacts or certify an older package. Prefer rebuilding from the JSON registry instead of modifying hashed bundles.
