# 开发进度

更新时间：2026-07-06

## 当前阶段

阶段：`stage-12-unit-test-foundation`

目标：在当前环境没有真实 NapCat、Chromium/Chrome 和真实 Provider 凭证的前提下，建立无外部依赖的本地单元回归入口，覆盖核心纯函数边界，减少后续阶段只依赖 smoke 的风险。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 新增 `scripts/verify-stage12.config.ts` 和 `scripts/verify-stage12-unit-foundation.ts`。
- 新增 `npm run verify:stage12`，并纳入 `npm run verify`。
- `verify:stage12` 不新增依赖，使用项目现有 Vite 构建脚本打包后运行。
- 新增 8 组纯函数单元回归：
  - 配置归一化：宽松列表解析、中文逗号、JSON 数组、模型优先级 slash 保留与去重。
  - 配置归一化：非法 Web 端口回退、生图全局超时 clamp、渠道 base_url 标准化、模型缓存字段剥离、proxy trim。
  - 消息安全：危险 CQ 码和 OneBot 媒体段检测、清洗、回复过滤和拦截提示。
  - 消息安全：发送 API、字符串 CQ、数组消息段和嵌套合并转发媒体拦截。
  - AI 权限：非主人 API 当前群约束、私聊目标填充、owner-only API 拦截、管理员 API 拦截。
  - 消息工具作用域：当前群补全、跨群查询拦截、私聊全局查询拦截、`get_message_by_id` 结果范围校验。
  - 工具过滤：普通用户过滤 owner-only 工具，主人保留全部工具。
  - 图片和代理工具：OpenAI 生图 URL 标准化、比例到尺寸映射、代理 URL 标准化。
- README、开发文档和交接文档已同步 `verify:stage12`。

## 子代理协作记录

本阶段未启用子代理。主代理直接实现单元回归基础，并同步文档。

## 当前代码状态

本阶段预期变更：

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `package.json`
- `scripts/verify-stage12.config.ts`
- `scripts/verify-stage12-unit-foundation.ts`

## 验证记录

已执行：

```bash
npx tsc --noEmit --pretty false
npm run verify:stage12
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
- `npm run verify:stage11` 构建成功，当前环境无真实 Provider 配置，按预期 skip。
- `verify:stage12` 构建成功。
- 8 组单元回归全部通过。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git diff --check` 成功。

## 未完成事项

- 尚未验证真实 NapCat 实机加载和真实 adapter 行为。
- 当前环境未提供 Chromium/Chrome，因此 `verify:stage10` 尚未跑到真实浏览器完整链路。
- 当前环境未提供真实 Provider 凭证，因此 `verify:stage11` 尚未跑到真实 Provider 完整链路。
- 尚未建立 lint 或完整测试框架；当前只有轻量单元回归入口。
- `docs/NAPCAT_INTEGRATION_CHECKS.md` 已准备好，但尚未在真实 NapCat 环境逐项执行。

## 风险队列

1. 需要按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 执行真实 NapCat 实机或集成环境回归。
2. `verify:stage8` 使用伪 NapCat context，能覆盖插件入口生命周期，但不能替代真实 NapCat adapter、实际消息发送和真实插件配置页。
3. `verify:stage10` 已有真实浏览器预检脚本，但当前环境没有 Chromium/Chrome，仍需在有浏览器的集成环境执行完整链路。
4. `verify:stage11` 已有真实 Provider smoke 预检脚本，但当前环境没有 Provider 凭证，仍需在有凭证的集成环境执行完整链路。
5. `verify:stage12` 已覆盖部分核心纯函数，但尚未形成完整测试框架、覆盖率统计或 lint。
6. 本地 NapCat 类型 shim 解决了当前发布包 typecheck 噪声；后续升级 `napcat-types` 时需复核 shim 是否仍匹配运行时接口。

## 下阶段建议

阶段：`stage-13-test-depth-or-real-integration`

建议目标：

1. 若可用真实 NapCat 或沙箱，按 `docs/NAPCAT_INTEGRATION_CHECKS.md` 记录 `<prefix>诊断`、消息发送、配置页保存和 AI 工具权限。
2. 若集成环境有 Chromium/Chrome，执行 `AICAT_BROWSER_EXECUTABLE=/path/to/chrome npm run verify:stage10` 并记录完整真实浏览器结果。
3. 若可用 Provider 凭证，执行 `AICAT_REAL_IMAGE_SMOKE_CONFIG='...' npm run verify:stage11` 并记录真实 Provider 输出。
4. 若仍没有外部环境，继续扩大 `verify:stage12` 或拆分新的单元回归，优先覆盖配置保存、模型缓存、渠道优先级和 Web patch 冲突。
5. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
