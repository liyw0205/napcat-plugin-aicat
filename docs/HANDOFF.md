# 会话交接文档

更新时间：2026-07-05

## 给下一会话的启动指令

读取本文件和 `docs/PROGRESS.md` 后继续，不需要加载上一轮完整对话。

下一阶段继续采用主代理加子代理协作：

- 主代理负责阶段拆分、代码整合、验证、文档更新、git commit。
- 子代理优先用于只读风险梳理、测试设计或不重叠文件范围的实现任务。
- 子代理不得重复主代理正在做的同一项工作。

## 当前完成进度

已完成 `stage-0-docs`：

- 建立 `docs/DEVELOPMENT.md`，包含项目架构、扩展规则、开源复用原则、阶段会话流程。
- 建立 `docs/PROGRESS.md` 和本交接文档。
- README 增加开发文档入口。

已完成 `stage-1-config-and-verification`：

- 修复 Web 面板配置保存旧状态覆盖风险。
- Web 配置接口返回 `_configRevision`，保存时版本不一致则返回 409。
- 涉及渠道或模型优先级的 Web 提交缺少 `_configRevision` 时也返回 409。
- Web 前端收到 409 后提示并自动重新加载最新配置。
- Web 保存链路改为统一归一化，入站 `models_cache` 不再覆盖独立缓存 JSON。
- `DEFAULT_PLUGIN_CONFIG.webEnable` 已改为 `false`，与 NapCat 配置 UI 默认值一致。
- 新增 `tsconfig.verify.json`、`npm run verify:config` 和 `npm run verify`。

已完成 `stage-2-ai-fallback-and-permissions`：

- `autoSwitchModel=false` 时 AI 对话只请求第一优先级模型，不再 fallback 到后续模型。
- 非主人用户不再向模型暴露 owner-only 工具。
- `list_custom_commands`、`list_scheduled_tasks`、`list_user_watchers` 纳入 owner-only 工具。
- 普通用户的 `call_api` 被约束到当前群或当前用户，不能跨群、不能在私聊操作群、不能让机器人私聊其他人。
- 更多群状态修改 API 纳入管理员权限要求。
- 普通用户消息记录查询限定当前群，私聊不允许查询全局消息记录。
- 新增 `src/tools/ai-permissions.ts` 并加入 `npm run verify:config` 验证范围。
- 执行 `npm run verify:config`、`npm run build` 和 `npm run verify`，均通过。

已完成 `stage-3-image-proxy-and-web-hardening`：

- 新增 `src/utils/proxy-fetch.ts`，使用 `undici` `ProxyAgent` 支持 per-request HTTP/HTTPS 代理。
- `BaseImageAdapter.fetchRaw()` 已实际使用 `imageChannels[].proxy`。
- 修复 `openai`、`gemini`、`gemini_openai` adapter 中直接 `fetch` 的生图请求或返回图片 URL 下载。
- 生图模型拉取链路读取 `imageChannels[].proxy`。
- 新增 `webHost` 配置，默认 `127.0.0.1`。
- Web 启用时 `webToken` 为空或仍为 `changeme` 会拒绝启动。
- Web 服务不再默认监听 `0.0.0.0`；需要外部访问时显式设置 `webHost=0.0.0.0`。
- Web 前端不再把 Token 附加到每个 API query；`?token=` 登录后会清理地址栏。
- README、NapCat 配置 UI、Web 配置页已同步新策略。
- 执行 `npm run verify:config` 和 `npm run build`，均通过。

## 当前关键事实

- 项目是 NapCat 插件，构建入口为 `src/index.ts`，产物为 `dist/index.mjs`。
- 默认构建命令为 `npm run build`。
- 配置与权限纯模块验证命令为 `npm run verify:config`。
- 运行期依赖当前包括 `napcat-types` 和 `undici`。
- `undici` 版本范围为 `^6.27.0`，选择原因是支持 Node >= 18.17、MIT、无 native 构建、无运行依赖。
- Web 服务由 `src/core/state.ts` 定时同步，路由在 `src/core/web-server.ts`。
- Web 配置保存入口是 `pluginState.setWebConfigPatch()`。
- Web 配置版本字段为 `_configRevision`，只用于运行期冲突检测，不写入配置文件。
- Web 默认关闭；启用时默认监听 `127.0.0.1`，且必须设置非空、非 `changeme` 的 `webToken`。
- 配置保存会抽离 `models_cache` 到 `model-cache/` 独立 JSON；Web 保存不会再用入站 `models_cache` 覆盖缓存文件。
- AI 工具权限纯 helper 在 `src/tools/ai-permissions.ts`。
- 生图 Provider 走 `src/image/adapters/*` + `src/image/generator.ts` 的 adapter/fallback 模式。
- 生图代理入口为 `ImageChannelConfig.proxy`，请求出口由 `src/utils/proxy-fetch.ts` 统一处理；当前仅支持 `http://` 和 `https://` 代理。

## 已知风险

优先级从高到低：

1. 全量 `npx tsc --noEmit` 当前失败，不能直接作为门禁。已知原因包括 `napcat-types` 子路径源码导入、部分项目类型债等。
2. AI 工具权限已补强基础边界，但仍需要 NapCat 实机或集成环境回归。
3. 生图代理已接入代码链路，但尚未用真实 HTTP 代理端到端覆盖所有 Provider。
4. Web `webHost` 与不安全 Token 拒绝启动策略已实现，但尚未做 NapCat 实机热重启和外部访问回归。

## 下一阶段目标

推荐阶段名：`stage-4-typecheck-and-runtime-regression`

建议完成范围：

1. 子代理 A 只读梳理全量 typecheck 失败项：
   - `npx tsc --noEmit`
   - `tsconfig.json`
   - `napcat-types` 相关导入边界
2. 子代理 B 设计运行回归清单：
   - Web 启停、Token 校验、`webHost`
   - Web 配置保存乐观锁
   - 生图 proxy 假上游/假代理
   - AI 工具权限边界
3. 主代理基于子代理结论实施：
   - 优先修项目内类型债，不把 `napcat-types` 外部源码噪声混进本阶段。
   - 为生图 proxy 增加最小可自动运行验证。
   - 跑 `npm run verify:config` 和 `npm run build`。
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
chore(stage-4): expand runtime regression checks
```
