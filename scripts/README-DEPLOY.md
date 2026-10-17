# OpenAN Portal 独立部署包

本包内含 OpenAN Portal（插件化统一门户）的**生产构建产物**与一键部署脚本，可在任意新服务器上独立部署。

- 从当前审核过的源码和独立组件制品构建，不把历史发布包等同于当前 main；启用的插件统一由 `portal/bundled-plugins.json` 声明。

## 包内容

| 文件 | 说明 |
|---|---|
| `openan-portal-dist.tar.gz` | Portal 生产构建产物（index.html + assets/ + plugins/） |
| `deploy-zh.sh` | 一键部署脚本（中文提示）：复制备份 → 叠加解压 → 装 nginx 配置 → 自检 |
| `deploy-en.sh` | One-click deploy script (English output) |
| `deploy-common.sh` | 两个语言脚本共用的参数校验、模板渲染与插件自检，必须一起上传 |
| `apply-plugin-registration.sh` | 旧预构建制品的兼容注册工具，需 Python 3.9+；正常交付优先使用 JSON 清单重建 |
| `openan-portal.nginx.conf` | nginx 配置模板（端口可参数化） |
| `README-DEPLOY.md` | 本文档 |

## 前置条件（目标服务器）

1. **nginx**（`apt install nginx` 或 `yum install nginx`）
2. **后端服务**（Portal 是纯前端 + 网关，业务数据来自以下后端，按需部署）：

| 网关路径 | 上游 | 说明 |
|---|---|---|
| `/api/orchestrate/`、`/rest/v1/orchestrate/` | `127.0.0.1:5001` | 编排中心 FastAPI（`python -m orchestrate.start`） |
| `/api/registry-center/`、`/api/registry/` | `127.0.0.1:5000` | 注册中心 FastAPI |

> 后端未部署时 Portal 仍可打开，只是对应插件的列表数据为空/报错；至少部署编排中心（5001）即可使用「编排中心 + 执行中心」。

3. **防火墙/安全组**：放行 Portal 端口（默认 9003）。

## 部署步骤（目标服务器）

```bash
# 1. 上传整个目录到目标服务器，例如 /tmp/openan-portal-release/
scp -r portal-release/ user@<server>:/tmp/openan-portal-release/

# 2. 在目标服务器上执行（默认部署到 /OpenA2A-T/openan-portal-frontend，端口 9003+3003）
sudo bash /tmp/openan-portal-release/deploy-zh.sh    # 中文提示
sudo bash /tmp/openan-portal-release/deploy-en.sh    # English output

# 自定义路径与端口（两个脚本参数相同）：
sudo bash deploy-zh.sh /data/openan-portal-frontend 8080 8081
```

脚本会自动：复制备份旧目录（保留旧 chunk，平滑过渡旧会话）→ **叠加**解压新版 → 生成 nginx 配置 → `nginx -t` 校验 → reload → 自检页面/主包/插件清单。

## 部署后验证

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9003/                      # 期望 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9003/plugins/registry-center/plugin.manifest.json   # 期望 200
curl -s http://127.0.0.1:9003/api/orchestrate/rest/v1/orchestrate/workflows          # 期望 JSON（需编排中心后端）
```

浏览器访问 `http://<服务器IP>:9003/`，导航包括注册中心、编排中心、观测中心、虚拟展厅、AN 本体，以及内置的执行中心和技能中心。独立插件必须交付对应制品；技能中心当前标注为演示数据。旧 `ontology-demo` 插件已移除，不应重新注册。

## 回滚

```bash
rm -rf /OpenA2A-T/openan-portal-frontend && cp -a /OpenA2A-T/openan-portal-frontend.bak-<时间戳> /OpenA2A-T/openan-portal-frontend && nginx -s reload
```

> 部署为**叠加式**：旧 hash 命名的 chunk 会保留在 web root，部署前打开的浏览器会话可平滑过渡；历史文件会累积，可定期清理（脚本结束时打印清理命令）。

## 从源码重新构建（可选）

```bash
git clone <openan-portal 仓库> && cd openan-portal
npm ci
# 在各组件仓先执行 npm ci && npm run build:plugin，明确指定其制品目录：
npm run plugins:install -- registry-center=../registry-center/registry-center-web/dist-plugin orchestration-center=../orchestration-center/workflow-designer/dist-plugin
npm run plugins:install -- virtual-showroom=../openan-demo/portal-plugins/virtual-showroom/dist-plugin
npm run integrations:build
# 配置 integrations/dist-plugin/an-ontology/config.json 的 appUrl 为编辑器独立公开根 URL。
npm run plugins:install -- observation-center=integrations/dist-plugin/observation-center an-ontology=integrations/dist-plugin/an-ontology
npm run build:release  # 先检查必需插件，再构建 portal/dist/
# portal/dist/plugins.release.json 记录版本与 SHA-256；plugins.enabled 用于部署自检。
# 将 dist 内容打包为 openan-portal-dist.tar.gz，与本目录脚本一起交付。
```

> `npm run build` 只构建开发用壳层，不是完整交付验收。正式交付和 Docker 使用 `build:release`，缺少已启用插件或其资产时会失败；禁用的可选插件不参与自检。远程 bundle 仍可在运行时加载，但本地离线发布校验不替远程制品作可用性承诺。

观测网关配置 `OBSERVATION_URL`（开发/预览默认 `http://127.0.0.1:5002`）；容器也支持 `OBSERVATION_HOST/PORT/SCHEME`。独立 Nginx 按模板调整目标地址。本体必须另行部署原生 T-Box 服务并配置浏览器可达的独立根 URL；HTTPS Portal 需要 HTTPS 编辑器。两组件生产访问控制、编辑器嵌入策略及验证边界见 [适配说明](../integrations/README.md)。

启用清单只有 `portal/bundled-plugins.json` 一处。默认五个 bundle 均需交付；如需精简，由交付者显式禁用并重建，不要手改压缩主包。虚拟展厅的 `cards.json` 和 `images/` 会由安装工具一并复制并记录哈希。

旧包兼容：`bash apply-plugin-registration.sh WEB_ROOT [APP_URL]` 可补回新插件注册、设置 HTTP(S) AN 本体 URL。已完整注册时不重复追加，未知或歧义结构会拒绝且不改变部署文件；修改前保留 `.bak-plugins` 恢复副本。该操作不安装插件制品，也不证明旧包已通过当前发布验收。
