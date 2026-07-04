# 开发进度

更新时间：2026-07-05

## 当前阶段

阶段：`stage-0-docs`

目标：建立项目开发文档、分阶段多会话协作规则、进度文档和会话交接文档。

状态：已完成，验证通过，提交后结束本阶段。

## 本阶段完成内容

- 使用主代理加两个只读子代理完成项目现状梳理。
- 梳理了项目定位、目录职责、NapCat 生命周期、配置入口、运行时数据文件。
- 建立了后续阶段开发规则：每阶段主代理负责整合，子代理负责独立分析或独立实现任务。
- 建立了开源复用原则：成熟 npm/GitHub 方案优先，避免从零实现通用基础设施。
- 建立了扩展指南：新增会话渠道、生图 Provider、AI 工具、群聊指令、Web API。
- 记录了当前最高优先级技术风险。
- 新增会话交接文档，供下一阶段直接继续。

## 子代理协作记录

| 子代理 | 类型 | 任务 | 结果 |
|---|---|---|---|
| Russell | explorer | 梳理项目定位、入口、配置、文档缺口、技术风险 | 已完成，只读分析 |
| Popper | explorer | 梳理已有依赖、复用方案、后续复用原则 | 已完成，只读分析 |

## 当前代码状态

本阶段只新增/更新文档，不改运行时代码。

预期变更：

- `docs/DEVELOPMENT.md`
- `docs/PROGRESS.md`
- `docs/HANDOFF.md`
- `README.md`

## 验证记录

当前阶段为文档阶段，已执行：

```bash
npm install --no-package-lock
npm run build
git status --short
```

结果：

- `npm install --no-package-lock` 成功，未生成提交用 lockfile。
- `npm run build` 成功，Vite 输出 `dist/index.mjs`。
- `git status --short` 仅显示本阶段预期文档变更：`README.md` 和 `docs/`。

## 未完成事项

- 尚未修复任何运行时风险。
- 尚未新增测试、lint、typecheck 脚本。
- 尚未验证 NapCat 实机加载。

## 风险队列

1. 配置持久化可能在多入口保存时丢失渠道、模型优先级或模型缓存路径。
2. Web 默认开关和 Token 默认值存在安全默认值不一致问题。
3. `autoSwitchModel` 语义需要验证是否真实控制 fallback。
4. AI 工具权限需要集成级回归，防止普通用户越权。
5. 生图 `proxy` 字段目前可能只是配置传递，未实际生效。

## 下阶段建议

阶段：`stage-1-config-and-verification`

建议目标：

1. 建立最低自动验证基线，例如 `typecheck` 或最小单元验证脚本。
2. 验证并修复配置持久化多入口覆盖风险。
3. 明确 Web 首次安装默认值，必要时调整默认配置或配置 UI。
4. 更新 `docs/PROGRESS.md` 和 `docs/HANDOFF.md`，完成阶段 commit。
