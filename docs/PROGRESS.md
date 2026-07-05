# 开发进度

更新时间：2026-07-06

## 当前阶段

阶段：`stage-11-real-provider-smoke-preflight`

目标：在当前环境没有真实 Provider 凭证的前提下，补齐可复用的真实 Provider smoke 预检入口；当集成环境提供凭证时，直接用真实 adapter 执行生图并保存输出文件。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `scripts/verify-stage11.config.ts` 和 `scripts/verify-stage11-real-provider-smoke.ts`。
- 新增 `npm run verify:stage11`，并纳入 `npm run verify`。
- `verify:stage11` 无凭证时明确 skip，不影响本地门禁。
- 支持两种配置入口：
  - `AICAT_REAL_IMAGE_SMOKE_CONFIG`：JSON 对象或 targets 数组。
  - `AICAT_REAL_IMAGE_TARGETS_JSON`：仅 targets 数组，其他参数可用 `AICAT_REAL_IMAGE_PROMPT`、`AICAT_REAL_IMAGE_ASPECT_RATIO`、`AICAT_REAL_IMAGE_RESOLUTION`、`AICAT_REAL_IMAGE_REFERENCE_PATH` 补充。
- 有真实配置时，脚本会逐个 target 调用真实 `generateImageWithFallback([target], req)`，覆盖真实 adapter、真实 Provider 网络、可选代理和可选参考图。
- target 兼容插件配置风格的 `provider_type`、`base_url`、`api_key`，也兼容脚本内部使用的 `providerType`、`baseUrl`、`apiKey`。
- 生成图片写入 `tmp/stage11-real-provider-smoke/`。
- 错误输出会替换已知 API Key，避免在日志中直接打印凭证。
- README、开发文档和 NapCat 集成回归清单已同步 stage-11 用法。

## 子代理协作记录

本阶段未启用子代理。主代理直接实现真实 Provider smoke 预检脚本，并同步文档。

## 当前代码状态

本阶段预期变更：

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `docs/NAPCAT_INTEGRATION_CHECKS.md`
- `package.json`
- `scripts/verify-stage11.config.ts`
- `scripts/verify-stage11-real-provider-smoke.ts`

## 验证记录

已执行：

```bash
npx tsc --noEmit --pretty false
npm run verify:stage11
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
- `npm run verify:stage10` 构建成功，当前环境无 Chromium/Chrome，按预期 skip。
- `verify:stage11` 构建成功。
- 当前环境未设置真实 Provider 配置，脚本输出 skip：
  - `skip - 未设置 AICAT_REAL_IMAGE_SMOKE_CONFIG 或 AICAT_REAL_IMAGE_TARGETS_JSON，跳过真实 Provider smoke`
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证真实 NapCat 实机加载和真实 adapter 行为。
- 当前环境未提供 Chromium/Chrome，因此 `verify:stage10` 尚未跑到真实浏览器完整链路。
- 当前环境未提供真实 Provider 凭证，因此 `verify:stage11` 尚未跑到真实 Provider 完整链路。
- 尚未建立 lint 或完整单元测试框架。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. `verify:stage8` 使用伪 NapCat context，能覆盖插件入口生命周期，但不能替代真实 NapCat adapter、实际消息发送和真实插件配置页。
3. `verify:stage10` 已有真实浏览器预检脚本，但当前环境没有 Chromium/Chrome，仍需在有浏览器的集成环境执行完整链路。
4. `verify:stage11` 已有真实 Provider smoke 预检脚本，但当前环境没有 Provider 凭证，仍需在有凭证的集成环境执行完整链路。
5. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。
6. 尚未建立 lint 或完整单元测试框架。

## 下阶段建议

阶段：`stage-12-real-integration-or-test-foundation`

建议目标：

1. 若可用真实 NapCat 或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录 `<prefix>诊断`、消息发送、配置页保存和 AI 工具权限。
2. 若集成环境有 Chromium/Chrome，执行 `AICAT_BROWSER_EXECUTABLE=/path/to/chrome npm run verify:stage10` 并记录完整真实浏览器结果。
3. 若可用 Provider 凭证，执行 `AICAT_REAL_IMAGE_SMOKE_CONFIG='...' npm run verify:stage11` 并记录真实 Provider 输出。
4. 若仍没有外部环境，优先建立 lint 或更细粒度单元测试基础，减少后续阶段只靠 smoke 的风险。
5. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
