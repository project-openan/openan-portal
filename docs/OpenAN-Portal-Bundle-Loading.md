# OpenAN Portal 插件双模式加载方案(本地 / 远程)

> **版本**: 1.0 · **日期**: 2026-08 · **适用**: openan-website Portal 框架

> 当前交付命令与约束见 [集成契约](Portal-Integration-Contract.md)。默认 bundle 启用清单已集中到 `portal/bundled-plugins.json`；下文 demo-showcase 是模板示例，不是当前仓库自带目录。

---

## 1. 方案概述

插件 website **独立打包**成标准产物(js + css + manifest),Portal 以两种方式加载:

```
                    插件 website 独立构建
                          ↓
              plugin.manifest.json
              index.js (UMD 产物)
              index.css (样式产物)
                          │
          ┌───────────────┴────────────────┐
          ↓                                ↓
    【本地加载模式】                  【远程加载模式】
    产物 copy 到 Portal 目录          产物部署在插件自己的服务器
          ↓                                ↓
  portal/public/plugins/<id>/       http://<插件服务器>/plugins/<id>/
          ↓                                ↓
  Portal 运行时 <script>/<link>      Portal 运行时 <script>/<link>
  从同源加载(零 CORS)               跨域拉取(需 CORS 头)
```

**两种模式使用同一份产物、同一套契约、同一个加载器**,只是产物的部署位置不同。

---

## 2. 插件产物契约

### 2.1 产物结构

插件 website 用自己的构建配置打包,产出以下**固定结构**:

```
dist-bundle/
├── plugin.manifest.json   ← 插件元数据(运行时读取)
├── index.js               ← UMD 格式 JS 产物
└── index.css              ← CSS 产物(Tailwind 编译后)
```

### 2.2 plugin.manifest.json 格式

```json
{
    "id": "demo-showcase",
    "name": "Demo Showcase",
    "version": "1.0.0",
    "backend": { "gateway": "/api/registry" },
    "menu": [{
        "id": "demos",
        "labelKey": "demo-showcase:nav.demos",
        "order": 4,
        "route": "/demos"
    }],
    "routes": [{ "path": "/demos", "menuId": "demos" }],
    "entry": "index.js",
    "css": "index.css"
}
```

| 字段 | 说明 |
|------|------|
| `id` | 插件唯一 ID |
| `backend.gateway` | 可选,插件后端代理前缀(Portal 为其创建独立 axios) |
| `menu[].labelKey` | i18n key(格式 `namespace:key`) |
| `entry` | JS 产物文件名(UMD) |
| `css` | CSS 产物文件名 |

**注意**: menu 中不含 icon(函数无法 JSON 序列化),Portal 使用默认图标。

### 2.3 index.js 的 UMD 全局变量约定

JS 产物必须为 **UMD 格式**,并把组件赋值到约定的全局变量:

```js
// 构建产物的效果(由 vite lib mode 自动生成):
window.__OPENAN_PLUGIN__<id_下划线格式> = { default: ReactComponent }

// 例: id 为 demo-showcase →
window.__OPENAN_PLUGIN__demo_showcase = { default: DemoShowcase }
```

React/react-dom 必须 **external**(由 Portal 提供,避免多实例):

```js
// vite.bundle.config.js 关键配置
build: {
    lib: { entry: 'src/index.jsx', name: '__OPENAN_PLUGIN__demo_showcase', formats: ['umd'] },
    rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/client', 'react-i18next', '@openan/portal-sdk'],
        output: {
            globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM', 'react-i18next': 'ReactI18next', '@openan/portal-sdk': 'OpenANPortalSDK' },
            assetFileNames: 'index.css',
        },
    },
    cssCodeSplit: false,
}
```

### 2.4 组件代码要求

```jsx
// src/index.jsx — 插件组件(与源码模式完全相同的写法)
import { usePortalContext } from '@openan/portal-sdk';

export default function DemoShowcase() {
    const { api, auth, theme, i18n, navigate } = usePortalContext();
    // ... 业务代码
}
```

**限制**: 产物模式下 Portal 无法预加载插件的 i18n namespace,插件应内置翻译或用全局 `translation` namespace。

---

## 3. 插件打包构建

### 3.1 构建命令

```bash
cd plugins/demo-showcase    # 或独立仓库的 openan-plugin/ 目录
node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js
```

### 3.2 vite.bundle.config.js 完整模板

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const root = import.meta.dirname;
const globalName = '__OPENAN_PLUGIN__<你的插件id_下划线格式>';

// 从 plugin.manifest.js 源码提取 JSON 元数据(剥离 icon 函数)
function buildManifestJson() {
    const src = readFileSync(path.resolve(root, 'plugin.manifest.js'), 'utf-8');
    const pick = (key, fallback) => src.match(new RegExp(`${key}:\\s*['"]([^'"]+)['"]`))?.[1] || fallback;
    return JSON.stringify({
        id: pick('id', 'unknown'),
        name: pick('name', 'Unknown'),
        version: pick('version', '0.0.0'),
        backend: src.includes('gateway:') ? { gateway: pick('gateway', '') } : undefined,
        menu: src.includes('menu:') ? [{
            id: pick('id', 'plugin'),
            labelKey: src.match(/labelKey:\s*'([^']+)'/)?.[1],
            order: Number(src.match(/order:\s*(\d+)/)?.[1] || 99),
            route: src.match(/route:\s*'([^']+)'/)?.[1],
        }] : [],
        routes: [{ path: src.match(/path:\s*'([^']+)'/)?.[1] || '/plugin' }],
        entry: 'index.js',
        css: 'index.css',
    }, null, 2);
}

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'emit-plugin-manifest-json',
            generateBundle() {
                this.emitFile({ type: 'asset', fileName: 'plugin.manifest.json', source: buildManifestJson() });
            },
        },
    ],
    build: {
        outDir: 'dist-bundle',
        lib: {
            entry: path.resolve(root, 'src/index.jsx'),
            name: globalName,
            formats: ['umd'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            external: ['react', 'react-dom', 'react-dom/client', 'react-i18next', '@openan/portal-sdk'],
            output: {
                globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM', 'react-i18next': 'ReactI18next', '@openan/portal-sdk': 'OpenANPortalSDK' },
                assetFileNames: 'index.css',
            },
        },
        cssCodeSplit: false,
    },
});
```

### 3.3 产物验证

```bash
$ ls dist-bundle/
index.js              ← UMD,头部含 window.__OPENAN_PLUGIN__xxx 赋值
index.css             ← 编译后的样式
plugin.manifest.json  ← 元数据
```

---

## 4. 本地加载模式

### 4.1 原理

产物复制到 Portal 的 `public/plugins/` 目录,Vite dev server / 构建产物自动静态托管,浏览器**同源**加载。

### 4.2 部署步骤

```bash
# 1. 插件打包
cd plugins/demo-showcase
node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js

# 2. 复制产物到 Portal 本地插件目录
mkdir -p ../../portal/public/plugins/demo-showcase
cp dist-bundle/* ../../portal/public/plugins/demo-showcase/
```

**CI 自动化**(推荐):

```yaml
# .github/workflows/plugin-bundle.yml
- name: Build & install plugin artifacts
  run: |
    for plugin in registry-center orchestration-center; do
      cd plugins/$plugin
      node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js
      mkdir -p ../../portal/public/plugins/$plugin
      cp dist-bundle/* ../../portal/public/plugins/$plugin/
      cd ../..
    done
```

### 4.3 Portal 注册(plugins.config.js)

```js
const bundledPlugins = [
    {
        id: 'demo-showcase',           // id 用于菜单/禁用管理
        mode: 'bundle',                // ★ 声明产物模式
        entry: '/plugins/demo-showcase', // ★ 相对路径 → 本地模式
        enabled: true,
    },
];
```

**判定规则: `entry` 以 `/` 开头 = 本地模式(同源),以 `http(s)://` 开头 = 远程模式。**

### 4.4 加载流程

```
Portal 启动
  ↓ fetch /plugins/demo-showcase/plugin.manifest.json (同源)
  ↓ <link href="/plugins/demo-showcase/index.css"> 注入样式
  ↓ <script src="/plugins/demo-showcase/index.js"> 注入 UMD
  ↓ 读取 window.__OPENAN_PLUGIN__demo_showcase.default
  ↓ 注册路由 /demos,菜单出现
```

---

## 5. 远程加载模式

### 5.1 原理

产物部署在**插件自己的服务器**,Portal 运行时跨域拉取。插件可独立发版,Portal 无需重新构建。

### 5.2 插件服务器要求

任意静态文件服务器,满足两点:

1. 托管产物于 `http://<host>:<port>/plugins/<id>/` 路径
2. 响应带 CORS 头:`Access-Control-Allow-Origin: *`

**nginx 配置示例**(挂在插件后端服务器上):

```nginx
server {
    listen 5000;

    # 插件产物(远程加载入口)
    location /plugins/registry-center/ {
        alias /usr/share/nginx/html/plugins/registry-center/;
        add_header Access-Control-Allow-Origin *;
        add_header Content-Type application/javascript;
    }

    # 插件后端 API(可选,同服务器)
    location /rest/v1/registry/ {
        proxy_pass http://127.0.0.1:15000;
    }
}
```

**开发用 Node 静态服务**(已在 `scripts/plugin-artifact-server.mjs` 提供,端口 5500):

```bash
node scripts/plugin-artifact-server.mjs
# → http://127.0.0.1:5500 提供 dist-bundle 目录,CORS: *
```

### 5.3 Portal 注册(plugins.config.js)

```js
const bundledPlugins = [
    {
        id: 'demo-showcase-remote',
        mode: 'bundle',
        entry: 'http://localhost:5500/plugins/demo-showcase',  // ★ http:// 开头 → 远程模式
        enabled: true,
    },
    // 生产示例:
    // {
    //     id: 'registry-center',
    //     mode: 'bundle',
    //     entry: 'http://registry-center:5000/plugins/registry-center',
    //     enabled: true,
    // },
];
```

### 5.4 加载流程

```
Portal 启动
  ↓ fetch http://<插件服务器>/plugins/<id>/plugin.manifest.json (跨域,带 CORS)
  ↓ <link href="http://.../index.css"> 注入远程样式
  ↓ <script src="http://.../index.js"> 注入远程 UMD (crossorigin)
  ↓ 读取 window.__OPENAN_PLUGIN__<id>
  ↓ 注册路由,菜单出现
```

### 5.5 插件独立发版流程

```bash
# 只更新插件,Portal 不动
cd registry-center/openan-plugin
git tag v1.1.0
# CI: 构建 dist-bundle → 部署到注册中心服务器的 /plugins/registry-center/
# 用户刷新浏览器 → Portal 拉到新 manifest/index.js → 新版本生效
```

---

## 6. 两种模式对比与选型

| 维度 | 本地加载 | 远程加载 |
|------|----------|----------|
| 产物位置 | `portal/public/plugins/<id>/` | 插件自己的服务器 |
| entry 写法 | `/plugins/<id>` | `http://host:port/plugins/<id>` |
| CORS | 不需要(同源) | 必须(`Access-Control-Allow-Origin: *`) |
| 插件更新 | 重新复制产物 + 重发 Portal | 只发插件自己的版本 |
| 离线/内网 | ✅ 完全离线可用 | 需网络可达插件服务器 |
| 插件宕机影响 | 无(产物在本地) | 该插件不可用(其他插件不受影响) |
| 适用场景 | 统一交付、内网部署、版本强一致 | 插件独立迭代、独立团队、灰度发布 |

**推荐组合**: 生产统一交付用本地模式;跨团队独立迭代用远程模式;两者可在同一 `plugins.config.js` 混用。

---

## 7. 核心实现文件

| 文件 | 职责 |
|------|------|
| `portal/src/bundle-loader.js` | 统一加载器:fetch manifest → 注入 css → 注入 js → 读全局变量 → 包装 routes |
| `portal/src/plugins.config.js` | 注册表:`mode: 'bundle'` + `entry` 声明产物模式 |
| `portal/src/PortalApp.jsx` | 启动时分流:source 插件走 Vite 编译,bundle 插件走 bundle-loader |
| `plugins/<id>/vite.bundle.config.js` | 插件独立打包配置(UMD + external React) |
| `portal/public/plugins/<id>/` | 本地模式产物目录 |
| `scripts/plugin-artifact-server.mjs` | 远程模式开发/演示静态服务(:5500) |

## 8. 快速上手(5 分钟)

```bash
# 1. 打包插件
cd plugins/demo-showcase
node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js

# 2a. 本地模式:复制产物
mkdir -p ../../portal/public/plugins/demo-showcase
cp dist-bundle/* ../../portal/public/plugins/demo-showcase/

# 2b. 远程模式:启动静态服务
node ../../scripts/plugin-artifact-server.mjs

# 3. 在 plugins.config.js 注册(本地或远程,见上文)

# 4. 启动 Portal 验证
cd ../../portal
node ../../node_modules/vite/bin/vite.js --port 3003
# 浏览器 http://localhost:3003 → 导航栏出现 bundle 插件
```

## 9. 历史模板验证记录

以下是该方案最初的演示验证，不代表当前 main 或任何当前交付包已完成验收；当前版本须执行 `build:release` 和集成契约中的测试。

| 验证项 | 结果 |
|--------|------|
| 插件 UMD 产物构建 | ✅ 1757 modules, 51.75 kB |
| plugin.manifest.json 生成 | ✅ 含 menu/routes/entry/css |
| 本地模式:Portal 静态托管产物 | ✅ HTTP 200 |
| 远程模式:静态服务 + CORS | ✅ HTTP 200, `Access-Control-Allow-Origin: *` |
| Portal 混合加载(source + bundle) | ✅ 5 插件共存,无报错 |
