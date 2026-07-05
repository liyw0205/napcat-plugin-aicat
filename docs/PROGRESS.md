# 开发进度

更新时间：2026-07-05

## 当前阶段

阶段：`stage-5-napcat-integration-readiness`

目标：准备 NapCat 实机/集成回归步骤，增加轻量诊断入口，并修复集成梳理中发现的运行态边界问题。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `docs/NAPCAT_INTEGRATION_CHECKS.md`：
  - 覆盖安装/构建、运行态诊断、Web 默认关闭、弱 Token 拒绝、本机监听、鉴权、热重启、插件重载、配置冲突。
  - 覆盖 NapCat 配置页保存、复杂字段不覆盖、列表配置输入兼容。
  - 覆盖群聊/私聊消息发送、AI 工具权限、真实生图 Provider、回归记录和回滚步骤。
- 新增主人诊断指令：
  - `<prefix>诊断` / `<prefix>集成诊断` 输出版本、Adapter、Actions、NetworkConfig、配置文件、Web 实际状态、模型数量、运行开关、权限数量和生图队列。
  - 诊断不输出 Web Token、API Key 或其他密钥。
  - README 和帮助文本已同步。
- 修复集成梳理发现的运行态边界：
  - `pluginState.setVerificationCleanupInterval()` 会重新启动 Web monitor，避免 `plugin_cleanup()` 后同进程再次 `plugin_init()` 时 Web 热同步失效。
  - 替换验证码清理定时器前会清理旧 interval，避免同模块重复 init 时挂重复定时器。
  - 非主人通过 `get_message_by_id` 查询消息时，结果必须属于当前群；私聊记录或无 `group_id` 结果也会被拒绝。
- 自动回归补强：
  - `verify:stage4` 新增 Web monitor 重启回归。
  - `verify:stage4` 新增 `x-token` 和 `?token=` 鉴权回归。
  - `verify:stage4` 新增 `get_message_by_id` 私聊结果拒绝、当前群结果允许回归。

## 子代理协作记录

| 子代理 | 类型 | 任务 | 结果 |
|---|---|---|---|
| Averroes | explorer | 只读梳理 NapCat 生命周期和 Web 同步入口 | 发现同进程 cleanup 后再次 init 可能不会恢复 Web monitor；建议新增主人诊断指令，已采纳并修复 |
| Planck | explorer | 只读梳理真实场景回归清单 | 提供 Web、配置页、消息发送、AI 权限、生图 Provider 手工用例；指出 `get_message_by_id` 私聊结果边界，已修复 |

## 当前代码状态

本阶段预期变更：

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/NAPCAT_INTEGRATION_CHECKS.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `src/handlers/command-handler.ts`
- `src/core/state.ts`
- `src/tools/ai-permissions.ts`
- `scripts/verify-stage4-runtime.ts`

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
- `npm run verify:stage4` 成功，包含 Web monitor 重启、Web 鉴权扩展、消息 ID 结果范围回归。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证 NapCat 实机加载。
- 尚未建立 lint 或完整单元测试框架。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。
- 生图代理自动回归覆盖了 OpenAI、Gemini 和模型拉取路径；其他外部 Provider 仍建议用真实服务补充回归。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. Web 前端表单、渠道弹窗、高级 JSON、409 后刷新和自拍上传尚无浏览器 E2E。
3. 真实 Provider 行为仍需覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee`。
4. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
5. `verify:stage4` 覆盖的是假上游/假代理，不能替代真实网络、真实 Provider 和真实 NapCat adapter 回归。

## 下阶段建议

阶段：`stage-6-web-e2e-and-provider-smoke`

建议目标：

1. 为 Web 面板补充轻量浏览器 E2E 或可脚本化 smoke，覆盖 Token 登录、配置保存、409 刷新和自拍上传基础路径。
2. 视可用凭证和沙箱条件，执行或脚本化真实 Provider smoke。
3. 按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录真实 NapCat 实机结果。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
