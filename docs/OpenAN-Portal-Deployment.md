# OpenAN Portal 部署方案(构建产物与插件交付)

> **版本**: 1.0 · **日期**: 2026-09 · **适用**: openan-portal Portal 框架
>
> 相关文档: [OpenAN-Portal-Bundle-Loading.md](./OpenAN-Portal-Bundle-Loading.md)(插件产物契约与加载器细节)

---

## 1. 方案概述

Portal 的部署产物由两部分组成:**Portal 壳 + 插件交付物**。插件有三条交付路径,
同一个插件框架内可混用,按插件的开发形态选择:

```
                     ┌─ 源码模式插件 ──→ Portal 构建时直接编译进 assets/ ─┐
                     │   (plugins/*/src)      无独立产物                 │
                     │                                                   ▼
  部署产物 =         │                                          Portal dist/
  (portal 构建)  ────┤                                                   ▲
  + (插件产物)       │   ┌── 本地 Bundle ── 部署阶段 copy 到 ────────────┤
                     │   │   dist-bundle/      dist/plugins/<id>/        │
                     └───┤                                                │
                         └── 远程 Bundle ─── 插件自托管,不 copy ────────┘
                             (插件服务器)      entry 写 http URL
```

**关键原则**: 构建产物**不入库**(dist/、dist-bundle/ 均被 .gitignore),全部在部署阶段
构建与归集;单插件可独立更新,不需要重建 Portal。

---

## 2. 三种插件交付模式

### 2.1 模式对比

| | 源码模式 | 本地 Bundle 模式 | 远程 Bundle 模式 |
|---|---|---|---|
| 插件代码位置 | 本仓库 `plugins/<id>/` | 本仓库或其他仓库 | 任意(插件自己的服务器) |
| 构建 | Portal `npm run build` 一并编译 | 插件独立构建出 UMD | 插件独立构建出 UMD |
| 部署动作 | 无(已在 Portal assets 内) | **部署时 copy 到 `dist/plugins/<id>/`** | 无(copy 到插件服务器) |
| 运行时加载 | 构建期 import | 同源 `<script>`(零 CORS) | 跨域 `<script>`(需 CORS) |
| 单插件更新 | 需重建 Portal | **替换目录即可** | 插件服务器自行更新 |
| 适用场景 | 与 Portal 同仓同节奏的插件 | 插件与 Portal 分仓库/分团队 | 插件独立部署、独立发版 |

### 2.2 模式开关(两处配置配合)

以 registry-center 从源码模式切换到本地 Bundle 模式为例:

1. **`plugins/plugin-overrides.json`** —— 禁用源码版(构建期 tree-shake):

```json
{
    "registry-center": { "enabled": false }
}
```

2. **`portal/src/plugins.config.js`** —— 登记 bundle 入口(同源路径 → 本地模式;
   `http://` 开头 → 远程模式):

```js
const bundledPlugins = [
    { id: 'registry-center-bundle', mode: 'bundle', entry: '/plugins/registry-center', enabled: true },
    // 远程模式示例:
    // { id: 'registry-center-remote', mode: 'bundle', entry: 'http://registry-server:5000/plugins/registry-center', enabled: true },
];
```

> 源码模式插件不需要任何登记——放入 `plugins/` 目录(含 `plugin.manifest.js`)即自动发现。

---

## 3. 部署目录结构

Portal 部署根目录(nginx root)的期望结构:

```
<portal-dist>/
├── index.html
├── assets/                          ← Portal 构建(源码模式插件已编译在内)
│   ├── index-*.js / index-*.css
│   └── <plugin>-*.js               ← 源码模式插件的懒加载 chunk
├── plugins/                         ← 本地 Bundle 模式插件产物(部署阶段拷入)
│   ├── <id>/
│   │   ├── plugin.manifest.json
│   │   ├── index.js                ← UMD,挂 window.__OPENAN_PLUGIN__<id>
│   │   └── index.css
│   └── ...
└── <plugin-static>/                 ← 插件附带的静态资源(如有,如 3D 展厅页面)
```

---

## 4. 构建流程

### 4.1 Portal 壳(必做)

```bash
npm install
npm run build          # → portal/dist/(源码模式插件同时编译)
```

### 4.2 本地 Bundle 插件(按需,本仓库插件)

在插件目录内执行(产物契约见 Bundle-Loading 文档):

```bash
cd plugins/<id>
node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js
# → plugins/<id>/dist-bundle/{plugin.manifest.json, index.js, index.css}
```

> 独立仓库插件同理,用其自带的 bundle 构建脚本
> (如 `npm run build:plugin`,产物一般在 `dist-plugin/`)。

### 4.3 独立仓库插件(以本体演示类为例)

独立仓库插件(前端 + 后端一体,如 ontology-demo)在**自己的仓库**构建:

- Portal 宿主形态: `dist-plugin/`(UMD 产物 + manifest + 插件静态资源)
- 部署时将产物 copy 到 `<portal-dist>/plugins/<id>/`,
  静态资源 copy 到 `<portal-dist>/<plugin-static>/`(如 `ontology/`)。

---

## 5. 标准部署流程

```
1. 构建 Portal            npm run build               → portal/dist/
2. 构建 bundle 插件        逐插件 vite.bundle.config   → 各 dist-bundle/
3. 归集产物                copy 各 dist-bundle → <portal-dist>/plugins/<id>/
4. (独立仓库插件)          copy dist-plugin 内容 → 同上 + 静态资源目录
5. 发布                   将 <portal-dist>/ 置于 nginx root(或整体替换)
6. 验证                   curl /plugins/<id>/plugin.manifest.json → 200
                          打开 Portal,菜单出现插件项;F12 无加载错误
```

---

## 6. Nginx 配置要求

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;        # = <portal-dist>
    index index.html;

    # 插件 UMD 产物:禁缓存(便于热更新)+ 放开 CORS(支持远程调试场景)
    location /plugins/ {
        add_header Cache-Control "no-cache";
        add_header Access-Control-Allow-Origin *;
        try_files $uri =404;
    }

    # 插件后端网关:按 manifest 的 backend.gateway 逐插件代理
    # (示例:registry-center 声明 gateway /api/registry-center)
    location /api/registry-center/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
    }

    # SPA 回退
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 7. 单插件更新与回滚

**更新**(本地 Bundle 插件,无需动 Portal):

```bash
cd plugins/<id> && node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js
cp dist-bundle/{plugin.manifest.json,index.js,index.css} <portal-dist>/plugins/<id>/
# 浏览器 Ctrl+F5(产物为 no-cache,常规刷新亦可)
```

**回滚**: 保留上一版产物目录,回滚即反向 copy;建议按版本归档:

```
/opt/backup/<date>/plugins/<id>/...
```

源码模式插件更新需要重建 Portal(`npm run build` + 替换 `assets/`)。

---

## 8. 模式选择建议

| 场景 | 建议 |
|---|---|
| 插件与 Portal 同仓库、发布节奏一致 | 源码模式(零部署成本) |
| 插件独立仓库/独立团队,复用 Portal 域名与登录 | 本地 Bundle(部署 copy) |
| 插件已独立部署(自带后端服务器),需要独立发版 | 远程 Bundle(自托管,`scripts/plugin-artifact-server.mjs` 可直接作为产物服务器) |

远程模式的产物服务器、CORS 与联调细节见
[OpenAN-Portal-Remote-Loading.md](./OpenAN-Portal-Remote-Loading.md)。
