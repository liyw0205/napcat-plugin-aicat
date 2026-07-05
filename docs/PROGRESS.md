# 开发进度

更新时间：2026-07-06

## 当前阶段

阶段：`stage-10-browser-e2e-preflight`

目标：在没有真实 NapCat、真实 Provider 凭证且当前 PATH 没有 Chromium/Chrome 的环境中，补齐可复用的真实浏览器 E2E 预检脚本；当集成环境提供浏览器时，覆盖 Web 面板真实浏览器登录、布局、表单保存、409 冲突、文件上传和移动端视口。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `scripts/verify-stage10.config.ts` 和 `scripts/verify-stage10-browser-e2e.ts`。
- 新增 `npm run verify:stage10`，并纳入 `npm run verify`。
- `verify:stage10` 不新增依赖，直接通过 Chromium/Chrome DevTools Protocol 驱动真实浏览器。
- 浏览器发现规则：
  - 优先读取 `AICAT_BROWSER_EXECUTABLE`、`CHROMIUM_PATH`、`CHROME_PATH`。
  - 其次在 PATH 中查找 `chromium`、`chromium-browser`、`google-chrome`、`google-chrome-stable`、`chrome`。
  - 当前环境没有可执行浏览器时明确输出 skip 并正常退出，同时清理 `pluginState` Web monitor，避免脚本挂住。
- 有浏览器时，脚本会启动真实 Web server 和真实浏览器，覆盖：
  - URL Token 登录、本地 Token 保存和地址栏 Token 清理。
  - 桌面端关键控件可见性、可点击性和横向溢出检查。
  - 中文表单配置保存。
  - 409 配置冲突提示和前端刷新。
  - 真实 File API / CDP 文件输入、自行上传自拍参考图和清除。
  - 移动端视口布局可见性、可点击性和横向溢出检查。

## 子代理协作记录

本阶段未启用子代理。主代理直接实现真实浏览器 E2E 预检脚本，并同步文档。

## 当前代码状态

本阶段预期变更：

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `package.json`
- `scripts/verify-stage10.config.ts`
- `scripts/verify-stage10-browser-e2e.ts`

## 验证记录

已执行：

```bash
npx tsc --noEmit --pretty false
npm run verify:stage10
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
- `npm run verify:stage9` 成功。
- `verify:stage10` 构建成功。
- 当前环境未发现 Chromium/Chrome，脚本输出 skip：
  - `skip - 未发现 Chromium/Chrome 可执行文件；设置 AICAT_BROWSER_EXECUTABLE 后可启用真实浏览器 E2E`
- 已修复 skip 路径的 `pluginState` Web monitor interval 清理问题，脚本不会挂住。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证真实 NapCat 实机加载和真实 adapter 行为。
- 当前环境未提供 Chromium/Chrome，因此 `verify:stage10` 尚未跑到真实浏览器完整链路。
- 尚未使用真实 Provider 凭证验证 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee`。
- 尚未建立 lint 或完整单元测试框架。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. `verify:stage8` 使用伪 NapCat context，能覆盖插件入口生命周期，但不能替代真实 NapCat adapter、实际消息发送和真实插件配置页。
3. `verify:stage10` 已有真实浏览器预检脚本，但当前环境没有 Chromium/Chrome，仍需在有浏览器的集成环境执行完整链路。
4. `verify:stage9` 是假 Provider contract smoke，不能替代真实 Provider 账号、真实 HTTP 代理、真实限流/超时/错误格式。
5. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
6. 尚未建立 lint 或完整单元测试框架。

## 下阶段建议

阶段：`stage-11-real-integration-execution`

建议目标：

1. 若可用真实 NapCat 或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录 `<prefix>诊断`、消息发送、配置页保存和 AI 工具权限。
2. 若集成环境有 Chromium/Chrome，执行 `AICAT_BROWSER_EXECUTABLE=/path/to/chrome npm run verify:stage10` 并记录完整真实浏览器结果。
3. 若可用 Provider 凭证，执行 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 真实 Provider smoke。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
