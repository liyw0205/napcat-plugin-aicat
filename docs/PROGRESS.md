# 开发进度

更新时间：2026-07-06

## 当前阶段

阶段：`stage-7-web-dom-e2e-fallback`

目标：在当前环境没有可用 Chromium/Chrome/Firefox 的前提下，为 Web 管理面板补充可自动执行的 DOM 回归，覆盖 stage-6 HTTP smoke 未触达的真实前端点击与状态刷新路径。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `scripts/verify-stage7.config.ts` 和 `scripts/verify-stage7-web-dom.ts`。
- 新增 `npm run verify:stage7`，并纳入 `npm run verify`。
- `verify:stage7` 启动真实 Web server，拉取真实 `/` 与 `/admin.js`，用 `linkedom` 执行管理页前端脚本。
- `verify:stage7` 覆盖：
  - `?token=` 登录、本地 `localStorage` 保存 Token、地址栏 Token 清理。
  - 基础表单保存，并验证配置文件实际更新。
  - 渠道弹窗打开、填写、保存、再通过 Web 保存持久化。
  - 高级 JSON 保存，并验证运行期 `_configRevision` 支持受保护配置提交。
  - 服务端配置被其他入口更新后，前端旧版本保存返回 409、提示并自动重新加载最新配置。
  - 自拍上传 UI 注入、选择文件、上传预览、清除参考图。
- README 和开发文档已同步 `verify:stage7`。

## 依赖评估记录

- 当前环境 PATH 中没有 `chromium`、`google-chrome`、`firefox`，仓库也没有 Playwright；因此本阶段未做真实浏览器 E2E。
- 评估 `playwright@1.61.1`：Apache-2.0，Node >=18，但需要浏览器二进制；当前 Termux 环境不可直接运行。
- 评估 `happy-dom@20.10.6`：MIT，Node >=20，不符合项目 Node 18 构建目标。
- 评估 `jsdom@29.1.1`：MIT，Node `^20.19.0 || ^22.13.0 || >=24.0.0`，不符合项目 Node 18 构建目标。
- 选择 `linkedom@^0.18.12`：ISC，Node >=16，无 native 构建，依赖体积较小，适合作为当前阶段 DOM harness。`npm audit` 返回 0 个漏洞。

## 子代理协作记录

本阶段未启用子代理。主代理直接实现 DOM 回归脚本并同步文档。

## 当前代码状态

本阶段预期变更：

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `package.json`
- `scripts/verify-stage7.config.ts`
- `scripts/verify-stage7-web-dom.ts`

说明：`package-lock.json` 由 `npm install` 生成但仓库 `.gitignore` 已忽略，未作为本阶段提交文件。

## 验证记录

已执行：

```bash
npx tsc --noEmit --pretty false
npm run verify:stage7
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
- `verify:stage7` 成功，包含 Web DOM Token 登录、表单保存、渠道弹窗、高级 JSON、409 自动刷新和自拍上传 UI。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证 NapCat 实机加载。
- 尚未使用真实 Chromium/Playwright 做浏览器布局、原生文件选择器和 CSS 渲染级 E2E。
- 尚未建立 lint 或完整单元测试框架。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。
- 生图代理自动回归覆盖了 OpenAI、Gemini 和模型拉取路径；`gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 仍建议用真实服务补充回归。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. `verify:stage7` 是 DOM harness，不是真实浏览器；仍不能覆盖布局、CSS 渲染、真实文件选择器、移动端输入法和浏览器安全策略差异。
3. 真实 Provider 行为仍需覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee`。
4. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
5. `verify:stage4` 覆盖的是假上游/假代理，不能替代真实网络、真实 Provider 和真实 NapCat adapter 回归。

## 下阶段建议

阶段：`stage-8-real-integration-or-browser-e2e`

建议目标：

1. 若可用真实 NapCat 或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录 `<prefix>诊断`、消息发送、配置页保存和 AI 工具权限。
2. 若环境补齐 Chromium/Playwright，增加真实浏览器 E2E，覆盖布局可见性、原生文件上传、移动端视口和 409 前端提示。
3. 若可用 Provider 凭证，执行 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` smoke。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
