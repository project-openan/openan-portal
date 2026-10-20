# Bundled plugin artifacts

本目录存放 LOCAL BUNDLE 模式插件的构建产物（UMD），由 `portal/bundled-plugins.json`
注册、构建时随 `portal/public/` 一起进入产物（Vite 复制 public/ → dist/）。

Plugins under this directory are LOCAL BUNDLE artifacts (UMD), registered in
`portal/bundled-plugins.json` and shipped inside the build output via Vite's
public-dir copy.

| 目录 / id | 版本 | 说明 |
|---|---|---|
| registry-center | 0.2.0 | Agent/Skill 注册中心 |
| orchestration-center | 0.2.0 | 编排中心 |
| observation-center | 1.0.0 | 观测中心 |
| virtual-showroom | 1.1.0 | 数字展厅（Demo Showcase） |
| an-ontology | 1.0.0 | AN 本体 |

## 更新方式 / How to update

1. 独立构建插件（各插件自己的仓库/构建管线），产出 `plugin.manifest.json`、
   `index.js`（UMD）、`index.css`（及静态资源）。
2. 覆盖本目录对应子目录，更新 `plugin.manifest.json` 的 `version`。
3. 提交 PR；`portal/bundled-plugins.json` 已注册全部插件，通常无需改动。

Independent builds overwrite the matching sub-directory here, bump the
manifest version, and open a PR. The JSON registry rarely changes.
