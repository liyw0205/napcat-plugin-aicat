# 开发进度

更新时间：2026-07-05

## 当前阶段

阶段：`stage-1-config-and-verification`

目标：建立最低自动验证基线，修复配置持久化多入口覆盖风险，统一 Web 首次安装默认值。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 使用主代理加两个只读子代理完成配置保存链路与验证基线梳理。
- 修复 Web 面板保存配置的旧状态覆盖风险：
  - `/api/config` 返回 `_configRevision`。
  - Web 保存时携带版本，若配置已被群聊指令、NapCat 配置页或其他 Web 页面更新，则返回 409。
  - 涉及渠道或模型优先级的 Web 提交缺少 `_configRevision` 时也返回 409。
  - 前端收到 409 后提示并自动重新加载最新配置。
- Web 保存链路改为统一归一化：
  - 通过 `normalizePluginConfig` 清洗入站配置。
  - 入站 `models_cache` 不再写回缓存 JSON，避免旧 Web 页面覆盖模型缓存文件。
  - `models_cache_path` 继续作为派生字段由保存链路重算。
- 统一 Web 默认值：
  - `DEFAULT_PLUGIN_CONFIG.webEnable` 从 `true` 改为 `false`，与 NapCat 配置 UI 默认值一致。
  - 首次安装默认不启动 Web 面板。
- 新增最低验证脚本：
  - `npm run verify:config`：只类型检查可脱离 NapCat 运行时的配置默认值与归一化模块。
  - `npm run verify`：执行 `verify:config` 后运行构建。

## 子代理协作记录

| 子代理 | 类型 | 任务 | 结果 |
|---|---|---|---|
| Tesla | explorer | 只读梳理配置保存链路 | 确认 Web 全量/浅合并保存存在 channels、priority、models_cache 覆盖风险 |
| Poincare | explorer | 只读梳理验证基线 | 确认全量 `tsc --noEmit` 暂不可作为门禁，建议先做配置纯模块验证 |

## 当前代码状态

本阶段预期变更：

- `package.json`
- `tsconfig.verify.json`
- `src/config.ts`
- `src/core/admin-assets.ts`
- `src/core/config-normalizer.ts`
- `src/core/config-service.ts`
- `src/core/state.ts`
- `src/core/web-server.ts`
- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`

## 验证记录

已执行：

```bash
npm run verify:config
npm run build
```

结果：

- `npm run verify:config` 成功。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。

补充验证结论：

- 直接运行 `npx tsc --noEmit` 当前失败，主要原因是 `napcat-types` 子路径导入解析到包内 `.ts` 源码，以及项目内既有类型债。该问题已记录为后续阶段风险，不作为本阶段门禁。

## 未完成事项

- 尚未建立全量 typecheck、lint 或测试框架。
- 尚未验证 NapCat 实机加载。
- 尚未拆分 Web 配置专用 API；当前通过 `_configRevision` 阻止旧页面静默覆盖。
- 尚未修复 `autoSwitchModel`、AI 工具权限回归、生图代理实际生效问题。

## 风险队列

1. `autoSwitchModel` 配置项需要验证是否真实控制 AI fallback。
2. AI 工具权限需要集成级回归，防止普通用户越权。
3. 生图 `proxy` 字段目前可能只是配置传递，未实际生效。
4. Web 默认启动已关闭，但 `webToken=changeme` 与监听 `0.0.0.0` 的启用后策略仍需明确。
5. 全量 `tsc --noEmit` 仍失败，需要后续拆解 NapCat 类型导入和项目类型债。

## 下阶段建议

阶段：`stage-2-ai-fallback-and-permissions`

建议目标：

1. 验证并修复 `autoSwitchModel` 是否真实控制 AI fallback。
2. 梳理 AI 工具权限边界，至少覆盖 owner-only API、自定义指令、定时任务、用户检测器、生图工具。
3. 继续扩大可通过的自动验证范围。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
