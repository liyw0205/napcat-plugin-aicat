# AI Cat 开发文档

本文档面向后续阶段开发会话。目标是让每个新会话只读取必要上下文，按阶段推进，避免长期会话积累过大上下文。

## 1. 项目定位

`napcat-plugin-aicat` 是 NapCat 插件，入口产物为 `index.mjs`。当前能力包括：

- AI 对话、上下文记忆、OpenAI 兼容工具调用。
- 群管理、OneBot API 调用、Packet/ProtoBuf 调试。
- 渠道与模型管理，会话模型和生图模型优先级。
- 文生图、图生图、自拍形象、多生图 Provider。
- Web 管理面板、模型监控、历史消息查询。
- 自定义指令、定时任务、用户检测器。

核心源码分层：

| 目录 | 职责 |
|---|---|
| `src/index.ts` | NapCat 生命周期入口、消息/事件总调度 |
| `src/core/` | 插件状态、配置服务、Web 服务、模型缓存、配置 UI |
| `src/handlers/` | 群聊指令、AI 指令、图片/点歌/Packet 指令编排 |
| `src/tools/` | AI 工具定义与执行、API/Web/消息/音乐/生图工具 |
| `src/managers/` | 上下文、白名单、模型监控、消息日志、定时任务、自定义指令、用户检测器 |
| `src/image/` | 生图链路、队列、审核、缓存、预设、自拍形象、Provider 适配器 |
| `src/utils/` | 消息处理、安全过滤、权限辅助 |

## 2. 运行与构建

当前脚本：

```bash
npm install
npm run build
mv dist/index.mjs index.mjs
```

构建链路：

- `package.json` 的 `build` 脚本执行 `vite build`。
- `vite.config.ts` 以 `src/index.ts` 为库入口，输出 `dist/index.mjs`。
- `tsconfig.json` 开启 `strict`，目标为 `ESNext`，模块解析为 `bundler`。

当前验证脚本：

```bash
npm run verify:config
npm run typecheck
npm run verify:proxy
npm run verify:stage4
npm run verify:stage6
npm run verify:stage7
npm run verify:stage8
npm run verify:stage9
npm run verify
```

- `verify:config` 覆盖可脱离 NapCat 运行时的配置默认值、归一化和纯权限模块。
- `typecheck` 使用 `tsconfig.typecheck.json` 做项目源码类型检查。
- `verify:proxy` 用假上游和假 HTTP 代理验证 `fetchWithProxy()`。
- `verify:stage4` 覆盖 Web 启停/鉴权、生图代理 adapter 路径和 AI 权限纯 helper。
- `verify:stage6` 启动真实 Web server 和真实 `pluginState.setWebConfigPatch()`，覆盖管理页资产、Token 鉴权、配置保存、409 冲突和自拍参考图上传/清除。
- `verify:stage7` 启动真实 Web server，使用 `linkedom` 加载并执行真实管理页 HTML/JS，覆盖 URL Token 登录、本地 Token 保存、表单保存、渠道弹窗、高级 JSON、409 后前端刷新和自拍上传 UI。
- `verify:stage8` 导入真实插件入口，使用伪 NapCat context 跑 `plugin_init`、NapCat 配置页保存、Web 热重启、主人/普通用户消息指令、notice 事件和 `plugin_cleanup` 生命周期 smoke。
- `verify:stage9` 使用本地假 Provider 服务覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 的 adapter 请求/响应解析和 retryable fallback。
- `verify` 串联配置验证、源码类型检查、代理回归、stage4 运行回归、stage6 Web smoke、stage7 Web DOM 回归、stage8 生命周期 smoke、stage9 Provider contract smoke 和构建。

阶段开发时优先跑 `npm run verify`。裸跑 `npx tsc --noEmit` 也应通过；`tsconfig.json` 通过本地 `types/napcat-types.d.ts` 映射隔离 `napcat-types` 发布包内部源码噪声，只检查本项目使用到的 NapCat 类型边界。

NapCat 实机或集成环境回归按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行。核心主人可发送 `<prefix>诊断` 或 `<prefix>集成诊断` 查看 actions、Web、模型、权限和生图队列运行态；该指令不得输出 Web Token、API Key 或其他密钥。

## 3. 生命周期与主流程

插件导出：

- `plugin_init`：读取版本、构建配置 UI、初始化配置、数据目录、管理器、清理定时器和 Web 服务同步。
- `plugin_onmessage`：处理消息记录、用户检测器、自定义指令、Packet 指令、图片指令、普通命令、AI 对话。
- `plugin_onevent`：处理 NapCat/OneBot notice 事件。
- `plugin_cleanup`：关闭定时器、Web 服务、消息日志等运行态资源。

消息处理应遵循现有顺序，避免新增能力绕过权限、日志、检测器或配置开关。

## 4. 配置与数据

默认配置在 `src/config.ts`，运行态配置由 `src/core/state.ts` 持有，配置清洗与渠道归一化在 `src/core/config-service.ts`。

配置入口：

- NapCat 插件配置页：基础配置，schema 在 `src/core/plugin-config-ui.ts`。
- Web 面板：复杂配置、渠道管理、模型测试、模型监控、自拍形象上传。
- 群聊主人指令：渠道、模型缓存、启用模型、模型优先级等。
- 直接编辑配置文件：兜底维护方式。

运行时数据：

| 数据 | 文件或目录 |
|---|---|
| 动态白名单 | `whitelist.json` |
| 自定义指令 | `custom_commands.json` |
| 定时任务 | `scheduled_tasks.json` |
| 用户检测器 | `user_watchers.json` |
| 消息日志 | `message-logs/*.json` |
| 模型监控 | `model_monitor.json` |
| 模型缓存 | `model-cache/chat/*.json`, `model-cache/image/*.json` |
| 生图用量 | `image_usage.json` |
| 生图缓存 | `image-cache/` |
| 生图预设 | `image_presets.json` |
| 自拍形象 | `image_persona.json`, `image-persona/` |

重要约束：

- 主配置保存前会把 `models_cache` 抽离到独立 JSON，主配置只保留 `models_cache_path`，不写空 `models_cache` 字段。
- 修改配置保存逻辑时，必须验证 Web 面板、群聊指令、NapCat 配置页三种入口不会互相覆盖关键字段。
- `webEnable` 默认值已在 `src/config.ts` 与配置 UI 中统一为 `false`，首次安装默认不启动 Web 面板。
- `webHost` 默认值为 `127.0.0.1`；如需外部访问必须显式配置 `0.0.0.0` 或指定监听地址。
- `webToken` 为空或仍为 `changeme` 时，Web 面板会拒绝启动。
- Web 配置保存带 `_configRevision` 乐观锁；涉及渠道或模型优先级的提交缺少版本或版本过旧都会返回 409，避免静默覆盖其他入口的新配置。
- Web 配置保存会经过统一归一化，入站 `models_cache` 不再写回独立缓存文件；模型缓存只应由拉取模型接口写入。

## 5. 扩展规则

### 5.1 新增会话模型渠道

优先接入 OpenAI 兼容 Chat Completions：

1. 复用 `src/tools/ai-client.ts`。
2. 复用 `src/core/channel-store.ts` 与 `src/core/config-service.ts` 的优先级解析。
3. 复用模型缓存刷新逻辑，不要在 handler 中硬编码 Provider 特例。

只有目标接口无法兼容 OpenAI 协议时，才新增独立客户端，并把差异隔离在 `tools` 或 `core` 层。

### 5.2 新增生图 Provider

新增 Provider 必须沿用 adapter 模式：

1. 在 `src/types.ts` 扩展 `ImageChannelConfig['provider_type']`。
2. 在 `src/image/adapters/` 新增适配器，继承 `BaseImageAdapter`。
3. 在 `src/image/generator.ts` 的 `createAdapter` 中注册。
4. 在渠道命令、Web 配置和 README 中同步展示 Provider 名称。
5. 验证文生图、图生图、超时、错误信息、fallback、审核链路。

不要把 Provider 请求细节写进 `src/handlers/image-handler.ts` 或 `src/handlers/ai-handler.ts`。

### 5.3 新增 AI 工具

1. 在 `src/tools/*` 或对应 `manager` 中声明工具 schema。
2. 在 `src/handlers/ai-handler.ts` 注册工具集合和执行分发。
3. 明确普通用户、管理员、核心主人权限边界。
4. 对会造成状态变化的工具，默认核心主人可用，除非有明确低风险依据。
5. 输出必须经过现有消息安全与回复清洗流程。

### 5.4 新增群聊指令

1. 优先在对应 handler 或 manager 中扩展，不要继续膨胀 `src/index.ts`。
2. 指令权限放在命令定义或入口分支处，不要只依赖文案提示。
3. 修改配置或数据时，必须走现有 manager/config service 保存路径。
4. 帮助文本、README、交接文档同步更新。

### 5.5 新增 Web API

当前 Web 服务基于 Node `http` 手写路由。继续扩展时：

1. 小型只读端点可以沿用现有路由风格。
2. 涉及复杂 body 校验、批量路由或权限分层时，应优先引入成熟路由和 schema 校验库。
3. 所有状态修改端点必须验证 Token。
4. 不要把大文件、模型缓存或敏感 token 原样返回给前端。

## 6. 开源复用原则

项目后续开发遵循“成熟方案优先”：

- 新增通用基础设施前，必须先检查 npm/GitHub 是否已有成熟维护方案。
- 只有当现有库不兼容 NapCat/Termux/ESM、引入体积或 native 构建风险过高、或需求非常小且已有实现足够清晰时，才保留自研。
- 新增依赖必须说明：维护状态、许可证、ESM/Node 兼容性、是否含 native 构建、是否适合 Termux/NapCat 插件环境。
- 禁止无理由重写 NapCat/OneBot 类型、OpenAI 兼容协议、Provider fallback、权限判断、配置归一化、JSON schema 校验、HTML parser、cron、队列、ProtoBuf、数据库等通用能力。

当前可优先评估的候选方向：

| 场景 | 候选方案 | 备注 |
|---|---|---|
| Web 路由 | `hono` + `@hono/node-server` 或 `itty-router` | Web 面板路由复杂化后再引入 |
| 请求/配置校验 | `zod` | 替代手写 JSON body 校验 |
| HTML/XML 解析 | `cheerio` 或 `linkedom` | 替代正则解析网页 |
| ProtoBuf | `protobufjs` | 需注意版本安全公告，避免使用存在 RCE 风险的旧版本 |
| 定时任务 | `croner` 或 `node-cron` | 当前任务简单时可保留现状 |
| 并发队列 | `p-queue` 或 `p-limit` | 生图队列复杂化后评估 |
| 本地持久化 | SQLite 方案 | `better-sqlite3` 有 native 构建风险，Termux 环境需先验证 |

实施当日必须重新核对候选库的最新版本、维护状态和安全公告，不能只依赖本文件。

## 7. 分阶段会话工作流

每个阶段使用“主代理 + 子代理”协作：

1. 主代理读取 `docs/HANDOFF.md`、`docs/PROGRESS.md` 和当前阶段相关源码。
2. 主代理拆分阶段目标，子代理只承担明确、独立、可验证的任务。
3. 探索型子代理只读分析；实现型子代理必须拥有清晰、不重叠的写入范围。
4. 主代理负责整合、审查、运行验证、更新文档、提交 git。
5. 阶段结束前必须更新：
   - `docs/PROGRESS.md`
   - `docs/HANDOFF.md`
6. 阶段结束以 git commit 收尾。
7. 下一会话只需要读取最新版交接文档和相关文件，不需要加载完整历史聊天。

阶段提交建议格式：

```text
docs(stage-0): establish phased development workflow
feat(stage-1): ...
fix(stage-2): ...
```

## 8. 阶段验收清单

每个阶段结束前至少确认：

- 需求范围已完成或明确记录未完成原因。
- 子代理结论已合并进实现或文档。
- 未覆盖风险写入 `docs/PROGRESS.md`。
- `docs/HANDOFF.md` 包含完成进度、关键文件、验证结果、下阶段目标。
- 已运行与变更风险匹配的验证命令。
- `git status --short` 中只有本阶段预期变更。
- 已创建阶段 commit。

## 9. 当前优先技术风险

后续阶段优先验证：

1. NapCat 实机或集成环境回归：按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 覆盖 Web 热重启、配置页保存、消息发送、AI 工具权限和真实适配器。
2. 生图代理已有自动回归覆盖 OpenAI、Gemini 和模型拉取路径；`verify:stage9` 已用假上游覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 的基础 contract，但仍建议用真实 Provider/真实 HTTP 代理覆盖这些外部服务。
3. 当前 typecheck 通过本地 NapCat 类型边界隔离外部包噪声；后续升级 `napcat-types` 时需复核这些 shim 是否仍匹配实际运行时。
4. 尚未建立 lint 或完整单元测试框架。
