# 开发进度

更新时间：2026-07-06

## 当前阶段

阶段：`stage-8-napcat-lifecycle-smoke`

目标：在当前环境没有真实 NapCat 实机、真实浏览器和 Provider 凭证的前提下，补充可离线执行的 NapCat 插件生命周期 smoke，覆盖真实入口导入、初始化、NapCat 配置页保存、消息指令、notice 事件和卸载。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `scripts/verify-stage8.config.ts` 和 `scripts/verify-stage8-napcat-lifecycle.ts`。
- 新增 `npm run verify:stage8`，并纳入 `npm run verify`。
- `verify:stage8` 使用伪 NapCat context 导入真实 `src/index.ts` 插件入口，覆盖：
  - `plugin_init()` 读取配置文件、初始化 actions/logger/adapter/networkConfig、构建 NapCat 配置 UI。
  - `plugin_init()` 在 `webEnable=true` 且 Token 合法时启动真实 Web server。
  - `plugin_get_config()` 不向 NapCat 配置页暴露复杂渠道和优先级字段。
  - `plugin_set_config()` 模拟 NapCat 配置页保存基础字段，验证不会覆盖 `chatChannels`、`imageChannels`、模型优先级。
  - `plugin_set_config()` 修改 Web 端口和 Token 后触发 Web 热重启。
  - 主人发送 `<prefix>诊断` 返回集成诊断，普通用户发送同一指令返回权限拒绝。
  - 普通用户基础指令 `<prefix>上下文` 可执行。
  - 主人在群内 `<prefix>关闭AI` 后，普通用户 `<prefix>AI状态` 可看到关闭状态。
  - `plugin_onevent()` 处理 notice 事件不抛错。
  - `plugin_cleanup()` 停止 Web server 和运行态资源。
- 修复 `src/core/model-cache-store.ts`：主配置保存时删除 `models_cache` 字段，只保留 `models_cache_path`，与开发文档和集成清单一致。

## 子代理协作记录

本阶段未启用子代理。主代理直接实现生命周期 smoke，并把 stage8 纳入完整验证链。

## 当前代码状态

本阶段预期变更：

- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `package.json`
- `src/core/model-cache-store.ts`
- `scripts/verify-stage8.config.ts`
- `scripts/verify-stage8-napcat-lifecycle.ts`

## 验证记录

已执行：

```bash
npx tsc --noEmit --pretty false
npm run verify:stage8
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
- `verify:stage8` 成功，包含插件初始化、NapCat 配置页 merge、Web 热重启、消息指令生命周期和 cleanup。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证真实 NapCat 实机加载和真实 adapter 行为。
- 尚未使用真实 Chromium/Playwright 做浏览器布局、原生文件选择器和 CSS 渲染级 E2E。
- 尚未建立 lint 或完整单元测试框架。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。
- 生图代理自动回归覆盖了 OpenAI、Gemini 和模型拉取路径；`gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` 仍建议用真实服务补充回归。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. `verify:stage8` 使用伪 NapCat context，能覆盖插件入口生命周期，但不能替代真实 NapCat adapter、实际消息发送和真实插件配置页。
3. `verify:stage7` 是 DOM harness，不是真实浏览器；仍不能覆盖布局、CSS 渲染、真实文件选择器、移动端输入法和浏览器安全策略差异。
4. 真实 Provider 行为仍需覆盖 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee`。
5. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
6. 尚未建立 lint 或完整单元测试框架。

## 下阶段建议

阶段：`stage-9-real-integration-or-browser-e2e`

建议目标：

1. 若可用真实 NapCat 或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录 `<prefix>诊断`、消息发送、配置页保存和 AI 工具权限。
2. 若环境补齐 Chromium/Playwright，增加真实浏览器 E2E，覆盖布局可见性、原生文件上传、移动端视口和 409 前端提示。
3. 若可用 Provider 凭证，执行 `gemini_openai`、`grok`、`jimeng2api`、`z_image_gitee` smoke。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
