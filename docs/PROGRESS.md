# 开发进度

更新时间：2026-07-05

## 当前阶段

阶段：`stage-4-typecheck-and-runtime-regression`

目标：拆解并修复项目内类型债，建立可自动运行的 Web、生图代理和 AI 权限回归基线。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 类型检查基线：
  - 新增 `types/napcat-types.d.ts`，为项目实际使用的 NapCat 类型提供本地边界。
  - 更新 `tsconfig.json`，通过 paths 映射隔离 `napcat-types` 发布包内部源码噪声。
  - 新增 `tsconfig.typecheck.json` 和 `npm run typecheck`。
  - 裸跑 `npx tsc --noEmit --pretty false` 已通过。
- 项目内类型债修复：
  - 修复生图 adapter 错误的 `../types` 导入路径。
  - 补齐 `optimizeImagePrompt` 导入。
  - 修复 AI 响应 `content` 可能为多模态数组时的文本收窄。
  - 修复生图队列泛型、消息日志事件字段、Packet 嵌套字段和自定义指令模板的类型问题。
- 权限 helper 可回归：
  - 将消息记录工具作用域判断抽到 `src/tools/ai-permissions.ts`。
  - AI handler 复用 `validateMessageToolScope()` 与 `validateMessageToolResultScope()`。
- 自动运行回归：
  - 新增 `scripts/verify-proxy-fetch.js`，低层验证 `fetchWithProxy()` 经过假 HTTP 代理，并拒绝不支持的代理协议。
  - 新增 `scripts/verify-stage4.config.ts` 和 `scripts/verify-stage4-runtime.ts`。
  - `verify:stage4` 覆盖：
    - Web 空 token / `changeme` 拒绝启动。
    - Web `127.0.0.1` 与 `0.0.0.0` 监听切换。
    - `/api/config` 无 token、错 token 401，Bearer / `x-aicat-token` 成功。
    - Web 配置冲突映射为 409。
    - 生图模型拉取走 proxy。
    - OpenAI 生图请求和返回图片 URL 下载走 proxy。
    - Gemini 原生生图请求走 proxy。
    - AI owner-only 工具过滤、API 权限、跨群/私聊发送限制、消息记录查询作用域。
- 验证脚本：
  - `npm run verify` 现在串联 `verify:config`、`typecheck`、`verify:proxy`、`verify:stage4` 和 `build`。

## 子代理协作记录

| 子代理 | 类型 | 任务 | 结果 |
|---|---|---|---|
| Gibbs | explorer | 只读梳理全量 typecheck 失败项 | 确认主要噪声来自 `napcat-types` 包内源码；项目内集中在 ActionMap 边界、adapter 导入、AI content 收窄、队列泛型等 |
| Huygens | explorer | 只读设计运行回归清单 | 建议不加依赖，用 Vite 打包 runner 覆盖 Web、配置冲突、生图代理和 AI 权限；已采纳核心方案 |

## 当前代码状态

本阶段预期变更：

- `package.json`
- `tsconfig.json`
- `tsconfig.typecheck.json`
- `types/napcat-types.d.ts`
- `scripts/verify-proxy-fetch.js`
- `scripts/verify-stage4.config.ts`
- `scripts/verify-stage4-runtime.ts`
- `src/tools/ai-permissions.ts`
- `src/handlers/ai-handler.ts`
- `src/handlers/image-handler.ts`
- `src/image/adapters/*`
- `src/image/task-queue.ts`
- `src/index.ts`
- `src/managers/custom-commands.ts`
- `src/tools/packet-tools.ts`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`

## 验证记录

已执行：

```bash
npx tsc --noEmit --pretty false
npm run verify
git diff --check
```

结果：

- 裸 `npx tsc --noEmit --pretty false` 成功。
- `npm run verify:config` 成功。
- `npm run typecheck` 成功。
- `npm run verify:proxy` 成功。
- `npm run verify:stage4` 成功。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证 NapCat 实机加载。
- 尚未建立 lint 或完整单元测试框架。
- 生图代理自动回归覆盖了 OpenAI、Gemini 和模型拉取路径；其他外部 Provider 仍建议用真实服务补充回归。

## 风险队列

1. NapCat 实机或集成环境仍需覆盖 Web 热重启、配置页保存、消息发送、AI 工具权限和生图真实 Provider。
2. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
3. `verify:stage4` 覆盖的是假上游/假代理，不能替代真实网络、真实 Provider 和真实 NapCat adapter 回归。

## 下阶段建议

阶段：`stage-5-napcat-integration-readiness`

建议目标：

1. 梳理并准备 NapCat 实机/集成回归步骤。
2. 针对 Web 热重启、NapCat 配置页保存、群聊消息发送、AI 工具权限、生图真实 Provider 制定可复现手工用例。
3. 视情况增加轻量日志或诊断命令，帮助实机回归定位问题。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
