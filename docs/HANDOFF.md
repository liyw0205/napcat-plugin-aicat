# 会话交接文档

更新时间：2026-07-05

## 给下一会话的启动指令

读取本文件和 `docs/PROGRESS.md` 后继续，不需要加载上一轮完整对话。

下一阶段必须继续采用主代理加子代理协作：

- 主代理负责阶段拆分、代码整合、验证、文档更新、git commit。
- 子代理优先用于只读风险梳理、测试设计或不重叠文件范围的实现任务。
- 子代理不得重复主代理正在做的同一项工作。

## 当前完成进度

已完成 `stage-0-docs`：

- 建立 `docs/DEVELOPMENT.md`，包含项目架构、扩展规则、开源复用原则、阶段会话流程。
- 建立 `docs/PROGRESS.md`，记录当前阶段进度、子代理协作记录、风险队列和下阶段建议。
- 建立本交接文档。
- README 增加开发文档入口。
- 执行 `npm install --no-package-lock` 和 `npm run build`，构建通过。

本阶段不包含运行时代码改动。

## 当前关键事实

- 项目是 NapCat 插件，构建入口为 `src/index.ts`，产物为 `dist/index.mjs`。
- 默认构建命令为 `npm run build`。
- 运行期依赖当前只有 `napcat-types`。
- Web 服务由 `src/core/state.ts` 定时同步，路由在 `src/core/web-server.ts`。
- 配置保存会抽离 `models_cache` 到 `model-cache/` 独立 JSON。
- 生图 Provider 走 `src/image/adapters/*` + `src/image/generator.ts` 的 adapter/fallback 模式。

## 已知风险

优先级从高到低：

1. 配置持久化：NapCat 配置页、Web 面板、群聊指令同时修改配置时，可能覆盖渠道、模型优先级或缓存路径。
2. Web 默认值：`src/config.ts` 中 `webEnable=true`，但 `src/core/plugin-config-ui.ts` 配置 UI 默认 `false`；`webToken` 默认 `changeme`。
3. 模型 fallback：`autoSwitchModel` 配置项存在，但需要确认 AI handler 是否按该开关控制失败切换。
4. 权限回归：AI 工具覆盖 OneBot API、定时任务、用户检测器、生图等能力，普通用户权限边界需要集成验证。
5. 生图代理：`proxy` 字段已传入适配器，但 `BaseImageAdapter.fetchRaw` 当前直接调用 `fetch`。

## 下一阶段目标

推荐阶段名：`stage-1-config-and-verification`

建议完成范围：

1. 子代理 A 只读梳理配置保存链路：
   - `src/index.ts`
   - `src/core/state.ts`
   - `src/core/config-service.ts`
   - `src/core/config-normalizer.ts`
   - `src/core/model-cache-store.ts`
   - `src/handlers/channel-command-handler.ts`
2. 子代理 B 只读梳理验证基线：
   - 当前能否增加 `typecheck` 脚本。
   - 当前是否适合引入轻量测试框架，或先写独立验证脚本。
   - 哪些配置函数可脱离 NapCat 上下文测试。
3. 主代理基于子代理结论实施：
   - 修复或明确配置保存风险。
   - 补充最低验证命令。
   - 跑 `npm run build` 和新增验证。
   - 更新进度与交接文档。
   - git commit 结束阶段。

## 开源复用提醒

下一阶段若需要新增通用能力，必须先复核 npm/GitHub 当前成熟方案：

- Web 路由或中间件：优先评估 `hono`、`@hono/node-server`、`itty-router`。
- JSON schema/配置校验：优先评估 `zod`。
- HTML/XML 解析：优先评估 `cheerio` 或 `linkedom`。
- ProtoBuf：优先评估 `protobufjs`，并确认安全公告和版本。
- cron/队列：优先评估 `croner`、`node-cron`、`p-queue`、`p-limit`。

不要为了短期方便继续扩大手写通用基础设施。

## 阶段结束要求

每个后续阶段结束前必须：

1. 更新 `docs/PROGRESS.md`。
2. 更新 `docs/HANDOFF.md`，写清完成进度和下阶段目标。
3. 运行与改动匹配的验证命令。
4. 检查 `git status --short`。
5. 创建 git commit。

建议 commit message：

```text
docs(stage-0): establish phased development workflow
feat(stage-1): harden config persistence
```
