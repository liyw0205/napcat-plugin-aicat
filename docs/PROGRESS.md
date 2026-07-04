# 开发进度

更新时间：2026-07-05

## 当前阶段

阶段：`stage-2-ai-fallback-and-permissions`

目标：修复 `autoSwitchModel` 行为，补强 AI 工具权限边界，继续扩大最低验证基线。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 修复 `autoSwitchModel`：
  - `autoSwitchModel=true` 时按模型优先级 fallback。
  - `autoSwitchModel=false` 时只请求第一优先级模型，失败后直接返回错误。
- 补强 AI 工具暴露范围：
  - 非主人用户不再向模型暴露 owner-only 工具。
  - `list_custom_commands`、`list_scheduled_tasks`、`list_user_watchers` 纳入 owner-only 工具。
- 补强 `call_api` 权限：
  - 普通用户不能跨群操作或在私聊中操作群。
  - 普通用户不能让机器人私聊其他人。
  - `send_group_msg`、`send_private_msg`、`send_msg` 在普通用户场景下自动约束到当前群或当前用户。
  - 更多群状态修改 API 纳入管理员权限要求，例如 `delete_msg`、`set_group_card`、群文件移动/上传/重命名等。
- 补强消息记录工具范围：
  - 普通用户私聊中不能查询全局消息记录。
  - 普通用户在群内查询消息时限定当前群。
  - `get_message_by_id` 对普通用户返回前会校验消息所属群。
- 新增纯权限 helper：
  - `src/tools/ai-permissions.ts`
  - 已加入 `tsconfig.verify.json` 的验证范围。

## 子代理协作记录

| 子代理 | 类型 | 任务 | 结果 |
|---|---|---|---|
| Godel | explorer | 只读梳理 `autoSwitchModel` | 服务端错误，未产出结论 |
| Schrodinger | explorer | 只读梳理 AI 工具权限 | 服务端错误，未产出结论 |

主代理已基于源码手动完成分析、实现和验证。

## 当前代码状态

本阶段预期变更：

- `src/config.ts`
- `src/handlers/ai-handler.ts`
- `src/tools/ai-permissions.ts`
- `tsconfig.verify.json`
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

## 未完成事项

- 尚未建立全量 typecheck、lint 或测试框架。
- 尚未验证 NapCat 实机加载。
- AI 工具权限已补强代码边界，但尚未做真实 OneBot 集成回归。
- 尚未修复生图 `proxy` 实际生效问题。

## 风险队列

1. 生图 `proxy` 字段目前可能只是配置传递，未实际生效。
2. Web 默认启动已关闭，但 `webToken=changeme` 与监听 `0.0.0.0` 的启用后策略仍需明确。
3. 全量 `tsc --noEmit` 仍失败，需要后续拆解 NapCat 类型导入和项目类型债。
4. AI 工具权限需要在 NapCat 实机或集成环境里覆盖 owner-only API、管理员 API、跨群发送、私聊发送、消息记录查询等场景。

## 下阶段建议

阶段：`stage-3-image-proxy-and-web-hardening`

建议目标：

1. 验证并修复生图 Provider `proxy` 字段是否实际生效。
2. 明确 Web 启用后的 Token 与监听地址策略。
3. 继续扩大可通过的自动验证范围。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
