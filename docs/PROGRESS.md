# 开发进度

更新时间：2026-07-05

## 当前阶段

阶段：`stage-6-web-e2e-and-provider-smoke`

目标：为 Web 面板补充可脚本化 smoke，覆盖 Token、配置保存、409 冲突和自拍上传基础路径；记录真实 Provider smoke 仍需外部凭证或实机环境。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `scripts/verify-stage6.config.ts` 和 `scripts/verify-stage6-web-smoke.ts`。
- 新增 `npm run verify:stage6`，并纳入 `npm run verify`。
- `verify:stage6` 覆盖：
  - 管理页 `/` 和 `/admin.js` 可公开加载。
  - 前端脚本包含 URL Token 存储、地址栏 Token 清理和自拍上传入口。
  - `/api/health` 公共可访问，`/api/config` 无 Token 返回 401。
  - `?token=` 可鉴权读取配置，并返回运行期 `_configRevision`。
  - 真实 `pluginState.setWebConfigPatch()` 可保存普通配置，保存文件不写入 `_configRevision`。
  - 带旧 `_configRevision` 修改渠道返回 409。
  - 修改渠道但缺少 `_configRevision` 返回 409。
  - 冲突保存不会改变会话/生图渠道配置。
  - `/api/selfie-reference` 可读取空状态、上传 data URL 图片并返回预览、清除参考图。
- `docs/DEVELOPMENT.md` 已同步 `verify:stage6` 门禁。
- 本地没有真实 NapCat 运行环境和 Provider 凭证；真实 Provider smoke 仍按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 在集成环境执行。

## 子代理协作记录

本阶段未启用子代理。主代理直接实现 Web smoke，并复用 stage-5 已整理的实机和 Provider 回归清单。

## 当前代码状态

本阶段预期变更：

- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `package.json`
- `scripts/verify-stage6.config.ts`
- `scripts/verify-stage6-web-smoke.ts`

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
- `npm run verify:stage6` 成功，包含 Web 资产、Token 鉴权、配置保存/冲突和自拍上传 API smoke。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证 NapCat 实机加载。
- 尚未建立 lint 或完整单元测试框架。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。
- 生图代理自动回归覆盖了 OpenAI、Gemini 和模型拉取路径；`gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 仍建议用真实服务补充回归。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. `verify:stage6` 是 HTTP/API smoke，不是完整浏览器 DOM E2E；Web 表单点击、渠道弹窗、高级 JSON、409 后前端刷新和自拍上传 UI 仍建议用浏览器 E2E 覆盖。
3. 真实 Provider 行为仍需覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee`。
4. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
5. `verify:stage4` 覆盖的是假上游/假代理，不能替代真实网络、真实 Provider 和真实 NapCat adapter 回归。

## 下阶段建议

阶段：`stage-7-browser-e2e-or-real-integration`

建议目标：

1. 若运行环境可用浏览器，补充真正的 Web DOM E2E，覆盖登录、表单保存、渠道弹窗、高级 JSON、409 前端刷新和自拍上传 UI。
2. 若可用真实 NapCat 或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录 `<prefix>诊断`、消息发送、配置页保存和 AI 工具权限。
3. 若可用 Provider 凭证，执行 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` smoke。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
