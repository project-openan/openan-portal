# 组件原生页面与 Portal 集成契约

Portal 负责导航、登录入口、主题语言上下文、插件隔离和网关客户端；组件仓维护业务页面与交互。独立部署与 Portal 集成必须使用同一份原生组件源码和样式，避免分别维护外观相似但行为不同的页面。

| 组件 | Portal 页面来源 | 本轮处理 |
| --- | --- | --- |
| 注册中心 | registry-center-web 原生 AgentRegistry | 注入网关客户端、SSE URL；独立语言 namespace；健康标签与空时间；按管理接口 registration.layer 显示真实层级 |
| 编排中心 | workflow-designer 原生编排、执行、技能页面 | 三个具名导出；引入完整 CSS；禁用 Portal 中重复的执行/技能源码插件 |
| 虚拟展厅 | openan-demo 原生 virtual-showroom 插件 | 保持配置卡片与原生样式，修复宿主固定高度下长页无法滚动 |
| 可观测中心 | 真实观测服务只读实时适配器 + 可选 observation-web 原生回放 | 实时与演示明确区分；原生回放通过专用 origin 嵌入 |
| 本体中心 | an-ontology 原生 T-Box 编辑器 | 专用 origin 嵌入；切换菜单保留已打开的工作区 |

## 制品与路由

组件的 `plugin.metadata.js` 是编排插件路由/菜单的单一来源。源码 manifest 与 UMD 构建引用相同 metadata；版本来自组件 package.json。路由可以声明 `componentExport`，例如 `ExecutionCenterPlugin`，宿主必须选择指定导出，缺失时明确失败。未声明时保持默认导出行为。

Portal 的 bundled 配置为编排插件声明 `/orchestration`、`/execution`、`/skills` 三条 `requiredRoutes`。安装、校验及运行加载均拒绝缺少路由的旧制品，避免旧 bundle 悄悄丢失功能。菜单提供 `label` 作为 namespaced 语言资源尚未加载时的可读回退。

业务 API 注入在原生子页面 effect 发起请求前完成；卸载时恢复组件默认客户端。注册中心 EventSource 与 axios 使用同一个网关，不受独立部署时保存的直接服务 IP 配置影响。组件翻译放入独立 namespace，不覆盖宿主和其他组件的默认资源。

`keepMounted` 是可选布尔字段，仅原生有状态编辑器需要启用。访问后切换菜单使用 hidden 容器保留实例；停用插件、退出或页面刷新仍会释放实例。它不提供数据持久化。常规列表和监控页仍按正常路由生命周期卸载。

## 构建与更新

先在各组件仓运行其测试和 `npm run build:plugin`，然后在 Portal 仓执行：

```powershell
npm run plugins:install -- registry-center=E:/Project/registry-center/registry-center-web/dist-plugin orchestration-center=E:/Project/orchestration-center/workflow-designer/dist-plugin virtual-showroom=E:/Project/openan-demo/portal-plugins/virtual-showroom/dist-plugin
npm run integrations:build
# 在部署制品目录配置 an-ontology 和可选 observation-center 的 config.json。
npm run plugins:install -- observation-center=integrations/dist-plugin/observation-center an-ontology=integrations/dist-plugin/an-ontology
npm test
npm run lint -- --quiet
npm run build:release
python scripts/verify-release.py portal/dist --url https://portal.example.org
```

示例路径需对应实际仓库。`config.json` 是部署侧地址配置，修改后必须重新生成 inventory 并构建。宿主重新构建不能代替组件制品重建；Vite 热更新也不能作为生产 UMD 已更新的验收证据。

## 验收边界

验证应同时包括原生页面和组装后的真实生产制品、真实服务 API/SSE、成功保存/读取及受控失败反馈。自动化中替换网络响应的测试只能证明前端合同，不能证明业务集成。

技能中心当前原生组件使用样例数据；嵌入它不代表已实现真实技能库存服务。观测原生回放使用演示数据；实时监控需独立验证真实服务 ingest/list/detail。编辑器完整工作流应在其原生页面验证，再核对嵌入挂载和切换保留；无法操作跨域框架控件时应明确记录覆盖范围。
