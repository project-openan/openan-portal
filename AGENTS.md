# AGENTS.md


## 部署纪律（全局规则 / Deployment Discipline — global rule, 2026-11-26）

中文：
1. 门户构建为**全量打包**（所有 source 插件与 i18n 语言块编译进同一 dist）。部署前必须 `git fetch origin main` 并确认本地 HEAD 不落后主线（`git rev-list --count HEAD..origin/main` 为 0）；落后时必须先合并主线，否则部署会把其他插件的改动打包回退（曾导致观测中心 i18n 回退事故）。
2. 部署使用 `portal/scripts/deploy_v5.py --scope <plugin>`（按插件作用域过滤上传文件）；**禁止全量盲传**。scope 取值：all / shell / execution-center / observation-center / virtual-showroom / skill-center / orchestration-center。
3. bundle 插件按目录隔离（public/plugins/<name>/）；source 插件共享 shell 与语言块，其部署前提是本地树已与 origin/main 同步。
4. 同一时间只允许一个会话执行部署；部署前先 diff 服务器与本地产物。
5. 所有改动完成后**立即提交**（双语 message + `git commit -s` DCO），避免未提交工作被并发会话覆盖。
6. 修改哪个插件就只打包/部署哪个插件；其他插件的产物一律不触碰。

English:
1. The portal build is **monolithic** (all source plugins and i18n chunks compile into one dist). Before deploying, run `git fetch origin main` and confirm local HEAD is not behind main (`git rev-list --count HEAD..origin/main` == 0); merge main first, or the deployment will roll back other plugins' changes (this once reverted the observation-center i18n).
2. Deploy with `portal/scripts/deploy_v5.py --scope <plugin>` (scope-filtered uploads); **blind full uploads are forbidden**. Scopes: all / shell / execution-center / observation-center / virtual-showroom / skill-center / orchestration-center.
3. Bundle plugins deploy per-directory (public/plugins/<name>/); source plugins share the shell and language chunks — they must deploy only when the local tree is synced with main.
4. Only one session may deploy at a time; diff server vs local artifacts before deploying.
5. **Commit immediately** after finishing changes (bilingual message + `git commit -s` DCO) so concurrent sessions cannot wipe uncommitted work.
6. Build/deploy only the plugin you modified; never touch other plugins' artifacts.
