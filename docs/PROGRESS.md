# 开发进度

更新时间：2026-07-05

## 当前阶段

阶段：`stage-3-image-proxy-and-web-hardening`

目标：让生图渠道 `proxy` 实际生效，并收紧 Web 面板启用后的监听地址与 Token 策略。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 生图代理实际生效：
  - 新增 `src/utils/proxy-fetch.ts`，使用 `undici` 的 `ProxyAgent` 为单次 `fetch` 注入 `dispatcher`，不修改全局 dispatcher。
  - `BaseImageAdapter.fetchRaw()` 统一走 proxy-aware fetch。
  - 修复 `openai`、`gemini`、`gemini_openai` 中绕过 `fetchRaw()` 的请求与图片 URL 下载。
  - 生图模型拉取链路也读取 `imageChannels[].proxy`。
  - `proxy` 配置统一 trim，空白值归 `undefined`。
- Web 启用策略加固：
  - 新增 `webHost` 配置，默认 `127.0.0.1`。
  - Web 服务不再默认监听 `0.0.0.0`；需要外部访问时必须显式设置 `webHost=0.0.0.0`。
  - `webToken` 为空或仍为 `changeme` 时拒绝启动 Web 服务。
  - 底层认证不再允许空 token 放行。
  - 前端 API 请求不再把 token 追加到 query；`?token=` 只用于初次登录，并会清理地址栏。
  - Web 配置页、NapCat 配置 UI、README 已同步新策略。
- 依赖调整：
  - 新增运行依赖 `undici@^6.27.0`。
  - 选择原因：MIT、无 native 构建、无运行依赖、支持 Node >= 18.17；当前 `undici@8` 需要 Node >= 22.19，不适合作为插件最低兼容选择。

## 子代理协作记录

| 子代理 | 类型 | 任务 | 结果 |
|---|---|---|---|
| Hegel | explorer | 只读梳理生图代理链路 | 确认 `proxy` 已传到 adapter，但 `fetchRaw()` 和若干 adapter 直接 `fetch` 未使用代理；指出模型拉取也应走代理 |
| Copernicus | explorer | 只读梳理 Web 启用安全策略 | 确认默认关闭但启用后仍有 `changeme`、`0.0.0.0`、空 token 放行风险；建议拒绝不安全 token 并改为本机监听 |

## 当前代码状态

本阶段预期变更：

- `package.json`
- `README.md`
- `src/config.ts`
- `src/types.ts`
- `src/utils/proxy-fetch.ts`
- `src/image/base-adapter.ts`
- `src/image/adapters/openai.ts`
- `src/image/adapters/gemini.ts`
- `src/image/adapters/gemini-openai.ts`
- `src/tools/model-discovery.ts`
- `src/core/web-server.ts`
- `src/core/state.ts`
- `src/core/config-normalizer.ts`
- `src/core/config-service.ts`
- `src/core/plugin-config-ui.ts`
- `src/core/admin-assets.ts`
- `src/core/admin-selfie-upload.ts`
- `src/handlers/command-handler.ts`
- `src/index.ts`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`

## 验证记录

已执行：

```bash
npm install --package-lock=false
npm run verify:config
npm run build
npm run verify
```

结果：

- `npm install --package-lock=false` 成功安装 `undici`，未生成锁文件。
- `npm run verify:config` 成功。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `npm run verify` 成功。

## 未完成事项

- 尚未建立全量 typecheck、lint 或测试框架。
- 尚未验证 NapCat 实机加载。
- 尚未用真实 HTTP 代理端到端验证所有生图 Provider。
- AI 工具权限仍需要 NapCat 实机或集成环境回归。

## 风险队列

1. 全量 `tsc --noEmit` 仍失败，需要后续拆解 NapCat 类型导入和项目类型债。
2. AI 工具权限需要在 NapCat 实机或集成环境里覆盖 owner-only API、管理员 API、跨群发送、私聊发送、消息记录查询等场景。
3. 生图代理已接入代码链路，但仍建议用真实 HTTP 代理回归 openai/gemini/gemini_openai/z_image_gitee/jimeng2api/grok。
4. Web 面板新增 `webHost` 与 Token 启动校验后，需要在 NapCat 实机确认配置页保存、Web 热重启、远程访问场景符合预期。

## 下阶段建议

阶段：`stage-4-typecheck-and-runtime-regression`

建议目标：

1. 拆解全量 `npx tsc --noEmit` 失败项，先修项目内类型债，避免被 `napcat-types` 子路径源码噪声阻塞。
2. 设计最小集成回归清单：Web 启停、配置保存、模型拉取、生图代理、AI 工具权限。
3. 为生图 proxy 增加可自动运行的假上游/假代理回归脚本或测试。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
