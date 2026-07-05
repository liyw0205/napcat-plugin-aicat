# 开发进度

更新时间：2026-07-06

## 当前阶段

阶段：`stage-9-provider-contract-smoke`

目标：在当前环境没有真实 Provider 凭证的前提下，补充剩余生图 Provider 的本地假上游 contract smoke，覆盖 adapter 请求体、响应解析和可重试失败后的 fallback。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `scripts/verify-stage9.config.ts` 和 `scripts/verify-stage9-provider-contracts.ts`。
- 新增 `npm run verify:stage9`，并纳入 `npm run verify`。
- `verify:stage9` 启动本地假 Provider HTTP server，使用真实 `generateImageWithFallback()` 和真实 adapter 路径覆盖：
  - `gemini_openai` 解析 `data:image/...;base64,...` 响应。
  - `gemini_openai` 解析 Markdown 图片 URL 响应，并下载返回图片 URL。
  - `gemini_openai` 带参考图时，请求体包含 `image_url` data URL。
  - `grok` 使用 `/v1/images/generations`、传递模型、比例、分辨率和 `response_format=b64_json`。
  - `jimeng2api` 使用 `/v1/images/generations`、传递模型、提示词和 `response_format=b64_json`。
  - `z_image_gitee` 使用 `/v1/images/generations`、传递模型、提示词、默认 size 和推理步数。
  - 上游 500 这类可重试错误后，`generateImageWithFallback()` 能切换到下一个 Provider target。

## 子代理协作记录

本阶段未启用子代理。主代理直接实现 Provider contract smoke，并同步文档。

## 当前代码状态

本阶段预期变更：

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `package.json`
- `scripts/verify-stage9.config.ts`
- `scripts/verify-stage9-provider-contracts.ts`

## 验证记录

已执行：

```bash
npx tsc --noEmit --pretty false
npm run verify:stage9
npm run verify
git diff --check
```

结果：

- 裸 `npx tsc --noEmit --pretty false` 成功。
- `npm run verify:config` 成功。
- `npm run typecheck` 成功。
- `npm run verify:proxy` 成功。
- `npm run verify:stage4` 成功。
- `npm run verify:stage6` 成功。
- `npm run verify:stage7` 成功。
- `npm run verify:stage8` 成功。
- `verify:stage9` 成功，包含 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` contract 和 fallback。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证真实 NapCat 实机加载和真实 adapter 行为。
- 尚未使用真实 Chromium/Playwright 做浏览器布局、原生文件选择器和 CSS 渲染级 E2E。
- 尚未建立 lint 或完整单元测试框架。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。
- `verify:stage9` 是假 Provider contract smoke，仍不能替代 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 真实服务回归。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. `verify:stage8` 使用伪 NapCat context，能覆盖插件入口生命周期，但不能替代真实 NapCat adapter、实际消息发送和真实插件配置页。
3. `verify:stage7` 是 DOM harness，不是真实浏览器；仍不能覆盖布局、CSS 渲染、真实文件选择器、移动端输入法和浏览器安全策略差异。
4. `verify:stage9` 是假 Provider contract smoke，不能替代真实 Provider 账号、真实 HTTP 代理、真实限流/超时/错误格式。
5. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
6. 尚未建立 lint 或完整单元测试框架。

## 下阶段建议

阶段：`stage-10-real-integration-or-browser-e2e`

建议目标：

1. 若可用真实 NapCat 或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录 `<prefix>诊断`、消息发送、配置页保存和 AI 工具权限。
2. 若环境补齐 Chromium/Playwright，增加真实浏览器 E2E，覆盖布局可见性、原生文件上传、移动端视口和 409 前端提示。
3. 若可用 Provider 凭证，执行 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` smoke。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
