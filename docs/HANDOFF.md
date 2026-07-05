# 会话交接文档

更新时间：2026-07-06

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

已完成 `stage-4-typecheck-and-runtime-regression`：

- 新增 `types/napcat-types.d.ts`，为项目实际使用的 NapCat 类型提供本地边界。
- 更新 `tsconfig.json`，裸跑 `npx tsc --noEmit --pretty false` 已通过。
- 新增 `tsconfig.typecheck.json` 和 `npm run typecheck`。
- 修复项目内类型债：adapter 类型导入、`optimizeImagePrompt` 导入、AI 多模态 content 收窄、生图队列泛型、消息日志事件字段、Packet 嵌套字段、自定义指令模板类型。
- 将消息记录工具作用域判断抽到 `src/tools/ai-permissions.ts`，便于纯脚本回归。
- 新增 `scripts/verify-proxy-fetch.js`，低层验证 `fetchWithProxy()`。
- 新增 `scripts/verify-stage4.config.ts` 和 `scripts/verify-stage4-runtime.ts`，覆盖 Web 鉴权/监听、配置冲突 409、生图模型拉取代理、OpenAI/Gemini 生图代理路径和 AI 权限 helper。
- `npm run verify` 已串联 `verify:config`、`typecheck`、`verify:proxy`、`verify:stage4` 和 `build`。
- 执行 `npx tsc --noEmit --pretty false`、`npm run verify`、`git diff --check`，均通过。

已完成 `stage-5-napcat-integration-readiness`：

- 新增 `docs/NAPCAT_INTEGRATION_CHECKS.md`，作为真实 NapCat 或集成沙箱回归入口。
- 新增主人指令 `<prefix>诊断` / `<prefix>集成诊断`，输出 Adapter、Actions、NetworkConfig、配置文件、Web 实际状态、模型数量、运行开关、权限数量和生图队列，不输出密钥。
- README、帮助文本和开发文档已同步诊断入口与回归清单。
- 修复 `plugin_cleanup()` 后同进程再次 `plugin_init()` 时 Web monitor 不恢复的边界；`setVerificationCleanupInterval()` 会重新启动 Web monitor。
- 替换验证码清理定时器时会清理旧 interval，避免重复 init 产生重复定时器。
- 修复非主人 `get_message_by_id` 结果范围：只能读取当前群消息，私聊记录或无 `group_id` 结果会被拒绝。
- `verify:stage4` 补充 Web monitor 重启、`x-token`、`?token=` 鉴权和消息 ID 私聊结果拒绝回归。
- 执行 `npx tsc --noEmit --pretty false`、`npm run verify`、`git diff --check`，均通过。

已完成 `stage-6-web-e2e-and-provider-smoke`：

- 新增 `scripts/verify-stage6.config.ts` 和 `scripts/verify-stage6-web-smoke.ts`。
- 新增 `npm run verify:stage6`，并纳入 `npm run verify`。
- `verify:stage6` 启动真实 Web server，使用真实 `pluginState.getWebConfigSnapshot()` 与 `pluginState.setWebConfigPatch()`。
- `verify:stage6` 覆盖管理页资产、`admin.js` 关键前端逻辑、Token 鉴权、配置保存、409 冲突、配置文件不写 `_configRevision`、自拍参考图上传/清除。
- 本地没有真实 NapCat 运行环境和 Provider 凭证；真实 Provider smoke 仍按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 在集成环境执行。
- 执行 `npx tsc --noEmit --pretty false`、`npm run verify`、`git diff --check`，均通过。

已完成 `stage-7-web-dom-e2e-fallback`：

- 当前环境 PATH 中没有 `chromium`、`google-chrome`、`firefox`，因此未做 Playwright/Chromium 真实浏览器 E2E。
- 新增 `linkedom@^0.18.12` 作为 dev dependency；选择原因是 Node >=16、ISC、无 native 构建，适合 Termux/NapCat 验证链路。`npm audit` 返回 0 个漏洞。
- 新增 `scripts/verify-stage7.config.ts` 和 `scripts/verify-stage7-web-dom.ts`。
- 新增 `npm run verify:stage7`，并纳入 `npm run verify`。
- `verify:stage7` 启动真实 Web server，拉取真实 `/` 与 `/admin.js`，用 DOM harness 执行真实前端脚本。
- `verify:stage7` 覆盖 URL Token 登录、本地 Token 保存、地址栏 Token 清理、表单保存、渠道弹窗、高级 JSON、409 后前端刷新和自拍上传 UI。
- README、开发文档和进度文档已同步 `verify:stage7`。
- 执行 `npx tsc --noEmit --pretty false`、`npm run verify`、`git diff --check`，均通过。

已完成 `stage-8-napcat-lifecycle-smoke`：

- 新增 `scripts/verify-stage8.config.ts` 和 `scripts/verify-stage8-napcat-lifecycle.ts`。
- 新增 `npm run verify:stage8`，并纳入 `npm run verify`。
- `verify:stage8` 导入真实 `src/index.ts` 插件入口，使用伪 NapCat context 跑 `plugin_init`、NapCat 配置页保存、Web 热重启、主人/普通用户消息指令、notice 事件和 `plugin_cleanup`。
- `verify:stage8` 覆盖 NapCat 配置页基础字段保存时不覆盖 `chatChannels`、`imageChannels`、模型优先级。
- 修复 `src/core/model-cache-store.ts`：主配置保存时删除 `models_cache` 字段，只保留 `models_cache_path`。
- 执行 `npx tsc --noEmit --pretty false`、`npm run verify`、`git diff --check`，均通过。

已完成 `stage-9-provider-contract-smoke`：

- 新增 `scripts/verify-stage9.config.ts` 和 `scripts/verify-stage9-provider-contracts.ts`。
- 新增 `npm run verify:stage9`，并纳入 `npm run verify`。
- `verify:stage9` 启动本地假 Provider HTTP server，使用真实 `generateImageWithFallback()` 和 adapter 路径覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee`。
- `verify:stage9` 覆盖 `gemini_openai` base64 响应、Markdown 图片 URL 下载、参考图 data URL 请求体；覆盖 `grok`、`jimeng2api`、`z_image_gitee` 的 b64_json contract；覆盖 500 后 fallback 到下一个 Provider target。
- 执行 `npx tsc --noEmit --pretty false`、`npm run verify`、`git diff --check`，均通过。

已完成 `stage-10-browser-e2e-preflight`：

- 新增 `scripts/verify-stage10.config.ts` 和 `scripts/verify-stage10-browser-e2e.ts`。
- 新增 `npm run verify:stage10`，并纳入 `npm run verify`。
- `verify:stage10` 不新增依赖，通过 Chromium/Chrome DevTools Protocol 驱动真实浏览器。
- 有浏览器时覆盖 URL Token 登录、地址栏 Token 清理、桌面端布局可见性、中文表单保存、409 冲突刷新、自拍参考图文件上传/清除和移动端视口布局。
- 当前环境未发现 Chromium/Chrome，脚本会明确 skip；已清理 skip 路径的 `pluginState` Web monitor，避免进程挂住。
- 执行 `npx tsc --noEmit --pretty false`、`npm run verify`、`git diff --check`，均通过；其中 `verify:stage10` 在当前无浏览器环境按预期 skip。

## 当前关键事实

- 项目是 NapCat 插件，构建入口为 `src/index.ts`，产物为 `dist/index.mjs`。
- 默认构建命令为 `npm run build`。
- 推荐阶段门禁命令为 `npm run verify`。
- `npm run verify` 当前串联 `verify:config`、`typecheck`、`verify:proxy`、`verify:stage4`、`verify:stage6`、`verify:stage7`、`verify:stage8`、`verify:stage9`、`verify:stage10` 和 `build`。
- 裸跑 `npx tsc --noEmit --pretty false` 当前通过。
- `tsconfig.json` 通过本地 `types/napcat-types.d.ts` 映射隔离 `napcat-types` 发布包内部源码噪声。
- 运行期依赖当前包括 `napcat-types` 和 `undici`。
- `undici` 版本范围为 `^6.27.0`，选择原因是支持 Node >= 18.17、MIT、无 native 构建、无运行依赖。
- 开发期 DOM 回归依赖 `linkedom@^0.18.12`，用于 `verify:stage7`。
- Web 服务由 `src/core/state.ts` 定时同步，路由在 `src/core/web-server.ts`。
- Web 配置保存入口是 `pluginState.setWebConfigPatch()`。
- Web 配置版本字段为 `_configRevision`，只用于运行期冲突检测，不写入配置文件。
- Web 默认关闭；启用时默认监听 `127.0.0.1`，且必须设置非空、非 `changeme` 的 `webToken`。
- Web monitor 由 `pluginState.setVerificationCleanupInterval()` 确保恢复，支持同进程 cleanup 后再次 init 的热同步。
- 配置保存会抽离 `models_cache` 到 `model-cache/` 独立 JSON；主配置只保留 `models_cache_path`，不写空 `models_cache` 字段；Web 保存不会再用入站 `models_cache` 覆盖缓存文件。
- AI 工具权限纯 helper 在 `src/tools/ai-permissions.ts`。
- 非主人消息记录工具只能查询当前群；`get_message_by_id` 如果结果不是当前群消息会被拒绝。
- 生图 Provider 走 `src/image/adapters/*` + `src/image/generator.ts` 的 adapter/fallback 模式。
- 生图代理入口为 `ImageChannelConfig.proxy`，请求出口由 `src/utils/proxy-fetch.ts` 统一处理；当前仅支持 `http://` 和 `https://` 代理。
- NapCat 实机/集成回归清单在 `docs/NAPCAT_INTEGRATION_CHECKS.md`。
- 核心主人可用 `<prefix>诊断` 或 `<prefix>集成诊断` 查看实机运行态。
- `verify:stage6` 是 HTTP/API smoke，不是完整浏览器 DOM E2E。
- `verify:stage7` 是 DOM harness，不是真实浏览器；不能替代 Playwright/Chromium 级布局、CSS、原生文件选择器和移动端输入法回归。
- `verify:stage8` 是伪 NapCat context 生命周期 smoke，不是真实 NapCat 实机回归。
- `verify:stage9` 是假 Provider contract smoke，不是真实 Provider 凭证和真实网络回归。
- `verify:stage10` 是真实浏览器预检脚本；当前本机没有 Chromium/Chrome 时会 skip，完整链路需在有浏览器的集成环境执行。

## 已知风险

优先级从高到低：

1. 尚未按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机加载和消息发送回归。
2. `verify:stage8` 已覆盖插件入口生命周期，但不能替代真实 NapCat adapter 和真实配置页。
3. Web 前端已有 `verify:stage10` 真实浏览器 E2E 预检脚本，但当前环境没有 Chromium/Chrome，尚未执行完整浏览器链路。
4. `verify:stage4` 使用假上游/假代理，不能替代真实网络和真实 Provider 行为。
5. `verify:stage9` 已覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 假上游 contract，但仍需真实 Provider smoke。
6. 本地 NapCat 类型 shim 与当前项目使用面匹配；后续升级 `napcat-types` 时需复核 shim。
7. 尚未建立 lint 或完整单元测试框架。

## 下一阶段目标

推荐阶段名：`stage-11-real-integration-execution`

建议完成范围：

1. 若可用 NapCat 实机，执行并记录：
   - `<prefix>诊断`
   - Web 热重启
   - NapCat 配置页保存
   - 群聊/私聊消息发送
   - AI 工具权限
2. 若运行环境可用 Chromium/Chrome，执行并记录：
   - `AICAT_BROWSER_EXECUTABLE=/path/to/chrome npm run verify:stage10`
   - URL Token 登录和地址清理。
   - 桌面端和移动端布局。
   - 自拍参考图文件上传。
   - 409 前端提示。
3. 若可用真实 Provider 凭证或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行 Provider smoke。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。

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
test(stage-11): run real integration smoke
```
