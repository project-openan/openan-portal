# GitCode component adapters / GitCode 组件适配器

These are Portal-owned presentation adapters, not copies of component backends.
这两个适配器只负责 Portal 展示与集成；业务服务、数据与原生编辑器仍归组件仓维护。

## Build / 构建

```bash
npm ci
npm run integrations:build
# Configure integrations/dist-plugin/an-ontology/config.json before installing:
# { "appUrl": "https://ontology.example.org/" }
npm run plugins:install -- observation-center=integrations/dist-plugin/observation-center an-ontology=integrations/dist-plugin/an-ontology
```

Both outputs contain a real UMD component, scoped CSS and a manifest. React,
react-i18next and the Portal SDK are external host singletons. They are outside
`plugins/` source discovery to avoid registering source and bundle modes twice.
构建输出不提交 Git；重复构建保留输出目录已有的 `config.json`，不会覆盖部署地址。
Installing into `portal/public/plugins` copies the sidecar too. Configure before
`build:release` so the published inventory hashes the final config. After any
post-deployment configuration edit, regenerate the release inventory and rebuild.

The other three bundles still come from registry-center, orchestration-center
and openan-demo. `npm run build:release` validates all five; these two adapters do
not bypass missing third-party artifacts or certify backend availability.

## Observation / 观测

Source contract: [GitCode observation-center](https://gitcode.com/OpenAN/observation-center),
verified against `98bd1843388c981c6ed6e0adf702f32d21ec894f`.

Start the existing service on 5002 using its own instructions. For Vite dev and
preview, set `OBSERVATION_URL` in the process environment before starting Vite
(default `http://127.0.0.1:5002`). Containers accept `OBSERVATION_URL` or
`OBSERVATION_HOST/PORT/SCHEME`; standalone Nginx uses the address in its template.

- `/api/observe/rest/v1/observe/traces`: real session list.
- `/api/observe/rest/v1/observe/traces/{session_id}`: real topology, summary,
  metrics and interactions. IDs are URL-encoded.
- Snapshot refresh runs 5 seconds **after** the preceding request finishes.
  Refresh can be paused or requested manually; old requests are aborted on
  session change/unmount. It does not start workflows or subscribe/unsubscribe
  engine notification channels. This is not the replay-only observation-web UI
  and does not claim an SSE topology animation or a full trace replay editor.
- Up to 200 recent interactions are rendered. Full history remains owned by
  the observation service / its configured Langfuse backend.

观测服务未配置 Langfuse 时仍能展示它的内存实时上报数据；历史持久化能力取决于服务端。
Portal gateway denies non-GET/HEAD requests; agents ingest directly into the
observation service through its separately managed network boundary.

## Ontology / 本体

Source: [GitCode an-ontology](https://gitcode.com/OpenAN/an-ontology), verified
against `98b807c921e1b71c8ac2613ba3dbb77671888f30` (master).

```bash
python -m pip install -r tbox-editor/backend/requirements.txt
python -m uvicorn tbox_editor.server:app --app-dir tbox-editor/backend --host 127.0.0.1 --port 8000
```

Use the component's own environment, writable workspace store and deployment
instructions. It currently requires a single worker for its in-process contexts.

`config.json` must specify the editor's **browser-reachable dedicated origin**,
e.g. `https://ontology.example.org/`; for local HTTP development only,
`http://127.0.0.1:8000/` works. A remote browser's localhost is not the server.
Only origin-root URLs are accepted because the native app owns root `/api` and
`/static` paths. HTTPS Portal requires an HTTPS editor. Credentials, queries,
fragments and Portal's own origin are rejected. Legacy deployment script URL
injection remains supported and takes precedence.

The iframe supports native editing, upload and download without copying or
changing its workspace protocol. Leaving the menu closes the embedded page:
**download work first** or use “Open separately” to keep editing independently.
The native editor manages its own theme/language; no unimplemented A-Box menu is
advertised. Cross-origin iframe failures cannot be reliably detected by its host;
the UI provides a separate-page link and troubleshooting guidance, not a false
“connected” status.

## Security and verification / 安全与验收

Portal login is not backend authorization for these currently independent
services. Restrict observation reads and the editor using an authenticated edge
gateway / network ACL. Configure editor `frame-ancestors` to allow the Portal;
do not forward host credentials into the frame or place tokens in URLs. Only
trusted editor origins should be configured. Frame isolation is not a replacement
for backend authorization.

Unit tests cover envelopes, error states, cancellation, non-overlapping refresh,
editor URL policy and iframe configuration. Real UMD tests compile both adapters
and render with the host SDK context. Proxy tests exercise dev and preview.
CI builds both adapters on Linux and Windows. Full release and live-service
checks must additionally install the other three actual bundles and start the
two real backends; successful shell compilation alone is not full acceptance.
