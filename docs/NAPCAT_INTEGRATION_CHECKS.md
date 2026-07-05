# NapCat 集成回归清单

本文档用于真实 NapCat 环境或集成沙箱中的手工回归。自动门禁先在本地完成，实机回归只验证自动脚本无法替代的 NapCat adapter、消息发送、配置页和真实 Provider 行为。

## 1. 前置检查

在插件目录执行：

```bash
npm install
npm run verify
npm run build
mv dist/index.mjs index.mjs
```

预期：

- `npm run verify` 全部通过。
- 其中 `verify:stage6` 已覆盖 Web 资产、Token 鉴权、配置保存/409 和自拍参考图 API smoke。
- 插件根目录存在 `index.mjs`。
- 重启 NapCat 后日志出现 `AI Cat 插件初始化完成`。

## 2. 运行态诊断

使用核心主人账号发送：

```text
<prefix>诊断
```

或：

```text
<prefix>集成诊断
```

预期诊断项：

- `Actions` 为 `已初始化`。
- `NetworkConfig` 为 `已初始化`。
- `配置文件` 指向实际 NapCat 插件配置 JSON。
- Web 配置、运行状态和鉴权状态符合当前配置。
- 会话渠道、生图渠道、启用模型数量符合配置。
- 生图队列显示 `running/pending/max`。

用普通用户发送同一指令，预期返回核心主人权限拒绝。

## 3. Web 面板

### 3.1 默认关闭

首次安装或 `webEnable=false` 时，预期：

- 诊断中 Web 配置为关闭。
- `http://127.0.0.1:<webPort>/api/health` 不可访问。

### 3.2 Token 门禁

将 `webEnable=true` 且 `webToken` 为空或 `changeme`，重启或等待同步。

预期：

- 日志提示 Web 面板拒绝启动。
- 诊断中 Web 运行状态为未运行。

### 3.3 本机监听与鉴权

设置：

```text
webEnable=true
webHost=127.0.0.1
webPort=14514
webToken=<强随机 Token>
```

验证：

```bash
curl -i http://127.0.0.1:14514/api/health
curl -i http://127.0.0.1:14514/api/config
curl -i -H "Authorization: Bearer <强随机 Token>" http://127.0.0.1:14514/api/config
curl -i -H "x-aicat-token: <强随机 Token>" http://127.0.0.1:14514/api/config
curl -i -H "x-token: <强随机 Token>" http://127.0.0.1:14514/api/config
curl -i "http://127.0.0.1:14514/api/config?token=<强随机 Token>"
```

预期：

- `/api/health` 返回 200。
- 无 Token 的 `/api/config` 返回 401。
- Bearer Token、`x-aicat-token`、`x-token` 与 `?token=` 均返回 200。

### 3.4 热重启

修改 `webHost`、`webPort` 或 `webToken` 后等待 3 秒以上。

预期：

- 旧地址停止响应。
- 新地址响应 `/api/health`。
- 诊断中 Web 运行地址更新。
- 轮换 `webToken` 后，旧 Token 返回 401，新 Token 返回 200。

需要局域网访问时，显式设置 `webHost=0.0.0.0`；默认 `127.0.0.1` 不应被外部访问。

### 3.5 插件重载

在 NapCat 中禁用再启用插件，或执行一次等价的插件重载。

预期：

- Web monitor 会恢复运行。
- `webEnable=true` 且 Token 合法时，Web 面板会重新监听。
- 修改 `webHost`、`webPort` 或 `webToken` 后，仍能在 3 秒左右完成热重启。

### 3.6 配置冲突

打开两个 Web 面板页面：

1. 页面 A 修改渠道或模型优先级并保存。
2. 页面 B 不刷新，继续修改渠道或模型优先级并保存。

预期：

- 页面 B 收到配置冲突提示。
- 前端重新加载最新配置。
- 配置文件中不写入 `_configRevision`。

## 4. NapCat 配置页

在 NapCat 插件配置页修改基础字段，例如：

- `prefix`
- `enableReply`
- `allowAtTrigger`
- `webEnable`
- `webHost`
- `webPort`
- `ownerQQs`
- `whitelistQQs`
- `disabledGroups`
- `imageGlobalTimeoutMs`
- `debug`

预期：

- 保存后插件日志出现配置更新。
- `<prefix>诊断` 显示新配置。
- 复杂字段不被覆盖：`chatChannels`、`imageChannels`、`enabledChatModelPriority`、`enabledImageModelPriority` 保持原值。
- 配置文件中的 `models_cache` 不回写进主配置，模型缓存仍在 `model-cache/`。
- `ownerQQs`、`whitelistQQs`、`disabledGroups` 支持 JSON 数组、逗号、空格和换行写法。
- 非法 `webPort` 应回退到默认端口。

## 5. 消息与基础指令

私聊验证：

- `<prefix>帮助` 返回帮助。
- `<prefix>上下文` 返回当前上下文状态。
- `<prefix>清除上下文` 清除当前上下文。
- 普通用户发送 `<prefix>诊断` 被拒绝。

群聊验证：

- `<prefix>AI状态` 返回本群状态。
- 核心主人发送 `<prefix>关闭AI` 后，普通 AI 对话不响应。
- 核心主人发送 `<prefix>开启AI` 后，普通 AI 对话恢复。
- `allowAtTrigger=true` 时，艾特机器人可触发 AI 或图片相关指令。
- `allowAtTrigger=false` 时，艾特机器人不触发普通 AI 对话。

消息发送预期：

- 普通回复通过 NapCat actions 正常发送。
- 长帮助可发送合并转发；若合并转发失败，应回退普通回复或在日志中留下错误。
- 重复消息 3 秒内不会重复发送。

## 6. AI 工具权限

需要使用支持 tool calling 的会话模型。

核心主人用例：

- 可以让 AI 查询主人专用信息，例如自定义指令、定时任务、用户检测器。
- 可以调用 owner-only OneBot API。

普通用户用例：

- 不应暴露 owner-only 工具。
- 不能查询全局消息记录。
- 群聊中查询消息记录时只能查询当前群。
- 群聊中通过 `get_message_by_id` 查询私聊消息 ID 或其他群消息 ID 应被拒绝。
- 私聊中不能操作群聊。
- 不能让机器人私聊其他人。

群管理员用例：

- 群管理员可在当前群触发需要管理员权限的群管理 API。
- 普通群成员触发同类 API 时应被拒绝。

## 7. 生图真实 Provider

每个真实 Provider 至少验证：

1. 配置渠道 `provider_type`、`base_url`、`api_key`、可选 `proxy`。
2. 拉取生图模型。
3. 启用至少一个生图模型。
4. 发送 `<prefix>生图 一只白猫坐在窗边`。
5. 发送带参考图或引用图片的图生图请求。
6. 如启用审核，验证提示词审核和出图审核路径。
7. 如配置代理，确认 Provider 请求和返回图片下载都经过代理日志。

重点 Provider：

- `openai`
- `gemini`
- `gemini_openai`
- `grok`
- `jimeng2api`
- `z_image_gitee`

Provider 差异重点：

- `openai`：验证 `gpt-image-*` 文生图、引用图图生图；非 `gpt-image` 模型带参考图时应返回清晰错误。
- `gemini`：验证无参考图、有参考图、比例和分辨率参数。
- `gemini_openai`：验证 `b64_json`、Markdown 图片 URL、裸 URL 三类返回。
- `grok`、`jimeng2api`、`z_image_gitee`：验证错误 API Key、超时、429/5xx；参考图、比例、分辨率如 Provider 不支持，应有可读结果或明确记录限制。

预期：

- 成功时机器人发送图片。
- 失败时返回可读错误，不吞掉异常。
- fallback 按启用生图模型优先级执行。
- 超时受渠道 timeout 和 `imageGlobalTimeoutMs` 约束。
- 生图队列并发不超过 `<prefix>诊断` 中的 `max`。

## 8. 回归记录

每次实机回归建议记录：

- 插件 commit hash。
- NapCat 版本和运行平台。
- Node 版本。
- `npm run verify` 结果。
- `<prefix>诊断` 输出截图或文本。
- Web curl 结果。
- 失败 Provider 的请求时间、渠道名、模型名、错误摘要。

## 9. 回滚

需要快速回滚时：

1. 关闭 `webEnable` 或恢复 `webHost=127.0.0.1`。
2. 停止 NapCat。
3. 替换回上一版 `index.mjs`。
4. 恢复上一版配置 JSON。
5. 启动 NapCat 后发送 `<prefix>诊断` 确认运行态。
