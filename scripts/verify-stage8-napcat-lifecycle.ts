import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { NapCatPluginContext, PluginLogger } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { ActionMap } from 'napcat-types/napcat-onebot/action/index';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import type { PluginConfig } from '../src/types';
import {
  plugin_cleanup,
  plugin_config_ui,
  plugin_get_config,
  plugin_init,
  plugin_onmessage,
  plugin_onevent,
  plugin_set_config,
} from '../src/index';
import { DEFAULT_PLUGIN_CONFIG } from '../src/config';
import { pluginState } from '../src/core/state';
import { getWebServerState } from '../src/core/web-server';

const TMP_DIR = path.resolve('tmp/stage8-napcat-lifecycle');
const INITIAL_TOKEN = 'stage8-token-initial';
const NEXT_TOKEN = 'stage8-token-next';

interface ActionCall {
  actionName: string;
  params: unknown;
  adapter: string;
  config: unknown;
}

interface CapturedLogs {
  info: string[];
  warn: string[];
  error: string[];
}

interface JsonResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
  text: string;
}

function assert (condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function listen (server: http.Server, host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('server address unavailable'));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer (server: http.Server): Promise<void> {
  return new Promise(resolve => {
    server.close(() => resolve());
  });
}

async function getFreePort (): Promise<number> {
  const server = http.createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

async function fetchJson<T = Record<string, unknown>> (
  url: string,
  init?: RequestInit
): Promise<JsonResponse<T>> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = {} as T;

  try {
    data = JSON.parse(text) as T;
  } catch {}

  return { status: res.status, data, text };
}

async function waitForOk (url: string, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  let lastError = '';

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = String(error);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error(`server did not become ready: ${lastError}`);
}

async function waitForDown (url: string, timeoutMs = 3000): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
    } catch {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error('server should be stopped');
}

function makeInitialConfig (port: number): PluginConfig {
  return {
    ...DEFAULT_PLUGIN_CONFIG,
    prefix: '/stage8',
    ownerQQs: '10001',
    whitelistQQs: ['20002'],
    disabledGroups: [],
    enableReply: false,
    sendConfirmMessage: false,
    randomReplyChancePercent: 0,
    randomActiveIntervalMinutes: 0,
    allowPublicPacket: false,
    webEnable: true,
    webHost: '127.0.0.1',
    webPort: port,
    webToken: INITIAL_TOKEN,
    chatChannels: [{
      name: 'stage8-chat',
      base_url: 'https://chat.invalid/v1',
      api_key: 'chat-secret',
      models_cache: [],
      enabled_models: [{ id: 'chat-model', enabled: true }],
      timeout: 20000,
    }],
    enabledChatModelPriority: ['stage8-chat/chat-model'],
    imageChannels: [{
      name: 'stage8-image',
      base_url: 'https://image.invalid/v1',
      api_key: 'image-secret',
      provider_type: 'openai',
      models_cache: [],
      enabled_models: [{ id: 'image-model', enabled: true }],
      timeout: 180000,
    }],
    enabledImageModelPriority: ['stage8-image/image-model'],
  };
}

function makeLogger (logs: CapturedLogs): PluginLogger {
  return {
    info: (message: string, ...args: unknown[]) => logs.info.push([message, ...args].map(String).join(' ')),
    warn: (message: string, ...args: unknown[]) => logs.warn.push([message, ...args].map(String).join(' ')),
    error: (message: string, ...args: unknown[]) => logs.error.push([message, ...args].map(String).join(' ')),
  };
}

function makeActions (calls: ActionCall[]): ActionMap {
  return {
    call: async (actionName, params, adapter, config) => {
      calls.push({ actionName, params, adapter, config });
      return { success: true, message_id: `stage8-${calls.length}` };
    },
    get: actionName => ({ actionName }),
  };
}

function makeNapCatConfigBuilder (): NapCatPluginContext['NapCatConfig'] {
  return {
    text: (key, name, defaultValue, description) => ({
      type: 'text',
      key,
      name,
      defaultValue,
      description,
    }),
    boolean: (key, name, defaultValue, description) => ({
      type: 'boolean',
      key,
      name,
      defaultValue,
      description,
    }),
    combine: (...items) => items,
  };
}

function makeContext (
  configPath: string,
  runtimeConfig: unknown,
  calls: ActionCall[],
  logs: CapturedLogs
): NapCatPluginContext {
  return {
    actions: makeActions(calls),
    adapterName: 'stage8-adapter',
    configPath,
    logger: makeLogger(logs),
    NapCatConfig: makeNapCatConfigBuilder(),
    pluginManager: {
      config: runtimeConfig,
    },
  };
}

function makeMessage (overrides: Partial<OB11Message>): OB11Message {
  const messageId = overrides.message_id ?? Date.now();

  return {
    post_type: 'message',
    message_type: overrides.message_type || 'private',
    message_id: messageId,
    user_id: overrides.user_id || '20002',
    self_id: overrides.self_id || '99999',
    raw_message: overrides.raw_message || '',
    message: overrides.message || [],
    sender: {
      user_id: overrides.user_id || '20002',
      nickname: `user-${String(overrides.user_id || '20002')}`,
      role: 'member',
      ...(overrides.sender || {}),
    },
    ...overrides,
  };
}

function privateMessage (userId: string, raw: string): OB11Message {
  return makeMessage({
    message_type: 'private',
    user_id: userId,
    raw_message: raw,
  });
}

function groupMessage (userId: string, groupId: string, raw: string): OB11Message {
  return makeMessage({
    message_type: 'group',
    group_id: groupId,
    user_id: userId,
    raw_message: raw,
  });
}

function getLastMessageText (calls: ActionCall[]): string {
  const last = calls[calls.length - 1];
  assert(last, 'expected at least one action call');

  const params = last.params as { message?: unknown; messages?: unknown; };
  const message = params.message ?? params.messages ?? '';

  if (typeof message === 'string') return message;

  if (Array.isArray(message)) {
    return message.map(item => {
      const row = item as { type?: string; data?: { text?: string; content?: unknown; }; };
      if (row.type === 'text') return row.data?.text || '';
      if (row.type === 'node') return JSON.stringify(row.data?.content || '');
      return JSON.stringify(row);
    }).join('');
  }

  return JSON.stringify(message);
}

function assertLastReplyContains (calls: ActionCall[], text: string): void {
  assert(calls.length > 0, `expected reply containing ${text}`);
  const last = calls[calls.length - 1];
  assert(last.actionName === 'send_msg', `expected send_msg, got ${last.actionName}`);
  assert(getLastMessageText(calls).includes(text), `reply should include ${text}`);
}

function readSavedConfig (configPath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
}

async function verifyPluginInit (
  ctx: NapCatPluginContext,
  logs: CapturedLogs,
  initialBaseUrl: string
): Promise<void> {
  await plugin_init(ctx);
  await waitForOk(`${initialBaseUrl}/api/health`);

  assert(pluginState.adapterName === 'stage8-adapter', 'adapter name should come from NapCat context');
  assert(pluginState.actions === ctx.actions, 'actions should be stored in plugin state');
  assert(pluginState.networkConfig === ctx.pluginManager.config, 'network config should be stored in plugin state');
  assert(pluginState.config.prefix === '/stage8', 'config should be loaded from config file');
  assert(pluginState.config.chatChannels.length === 1, 'chat channels should be loaded at init');
  assert(pluginState.config.imageChannels.length === 1, 'image channels should be loaded at init');
  assert((plugin_config_ui as unknown[]).length > 20, 'plugin config ui should be built');
  assert(logs.info.some(line => line.includes('AI Cat 插件初始化完成')), 'init completion should be logged');

  const health = await fetchJson<{ success?: boolean; data?: { auth?: boolean; }; }>(`${initialBaseUrl}/api/health`);
  assert(health.status === 200 && health.data.data?.auth === true, 'web server should run with auth after plugin init');
}

async function verifyNapCatConfigPageSave (
  ctx: NapCatPluginContext,
  configPath: string,
  nextBaseUrl: string,
  oldBaseUrl: string,
  nextPort: number
): Promise<void> {
  const exposed = await plugin_get_config();
  assert(!('chatChannels' in exposed), 'plugin_get_config should hide chatChannels');
  assert(!('imageChannels' in exposed), 'plugin_get_config should hide imageChannels');
  assert(!('enabledChatModelPriority' in exposed), 'plugin_get_config should hide chat priority');
  assert(!('enabledImageModelPriority' in exposed), 'plugin_get_config should hide image priority');

  await plugin_set_config(ctx, {
    prefix: '/stage8-updated',
    ownerQQs: '10001 10003',
    whitelistQQs: '["20002","20004"]',
    disabledGroups: '["7777"]',
    webEnable: true,
    webHost: '127.0.0.1',
    webPort: nextPort,
    webToken: NEXT_TOKEN,
    imageGlobalTimeoutMs: '200000',
  } as unknown as PluginConfig);

  await waitForOk(`${nextBaseUrl}/api/health`);
  await waitForDown(`${oldBaseUrl}/api/health`);

  assert(pluginState.config.prefix === '/stage8-updated', 'plugin_set_config should update prefix');
  assert(pluginState.config.ownerQQs === '10001,10003', 'plugin_set_config should normalize owners');
  assert(pluginState.config.whitelistQQs.includes('20004'), 'plugin_set_config should normalize whitelist');
  assert(pluginState.config.disabledGroups.includes('7777'), 'plugin_set_config should normalize disabled groups');
  assert(pluginState.config.chatChannels[0]?.name === 'stage8-chat', 'NapCat config save should preserve chat channels');
  assert(pluginState.config.enabledChatModelPriority[0] === 'stage8-chat/chat-model', 'NapCat config save should preserve chat priority');
  assert(pluginState.config.imageChannels[0]?.name === 'stage8-image', 'NapCat config save should preserve image channels');
  assert(pluginState.config.enabledImageModelPriority[0] === 'stage8-image/image-model', 'NapCat config save should preserve image priority');

  const noToken = await fetchJson(`${nextBaseUrl}/api/config`);
  assert(noToken.status === 401, 'rotated web server should require token');

  const withToken = await fetchJson<{ success?: boolean; data?: PluginConfig; }>(`${nextBaseUrl}/api/config`, {
    headers: { 'x-aicat-token': NEXT_TOKEN },
  });
  assert(withToken.status === 200 && withToken.data.success === true, 'rotated web server should accept new token');

  const saved = readSavedConfig(configPath);
  assert(!('_configRevision' in saved), 'NapCat config save should not write runtime revision');
  assert(Array.isArray(saved.chatChannels) && saved.chatChannels.length === 1, 'saved config should keep chat channels');
  assert(Array.isArray(saved.imageChannels) && saved.imageChannels.length === 1, 'saved config should keep image channels');
  assert((saved.chatChannels as Record<string, unknown>[])[0]?.models_cache === undefined, 'saved config should strip chat models_cache');
}

async function verifyMessageLifecycle (ctx: NapCatPluginContext, calls: ActionCall[]): Promise<void> {
  calls.length = 0;

  await plugin_onmessage(ctx, privateMessage('10001', '/stage8-updated 诊断'));
  assertLastReplyContains(calls, 'AI Cat 集成诊断');
  assertLastReplyContains(calls, 'Actions: 已初始化');
  assertLastReplyContains(calls, 'NetworkConfig: 已初始化');

  await plugin_onmessage(ctx, privateMessage('20002', '/stage8-updated 诊断'));
  assertLastReplyContains(calls, '该指令仅核心主人可用');

  await plugin_onmessage(ctx, privateMessage('20002', '/stage8-updated 上下文'));
  assertLastReplyContains(calls, '当前没有活跃上下文');

  await plugin_onmessage(ctx, groupMessage('10001', '8888', '/stage8-updated 关闭AI'));
  assertLastReplyContains(calls, 'AI对话已关闭');
  assert(pluginState.isGroupAIDisabled('8888'), 'owner command should disable group AI');

  await plugin_onmessage(ctx, groupMessage('20002', '8888', '/stage8-updated AI状态'));
  assertLastReplyContains(calls, '本群AI对话状态: ❌ 已关闭');

  await plugin_onevent(ctx, {
    post_type: 'notice',
    notice_type: 'group_admin',
    group_id: '8888',
    user_id: '20002',
    sub_type: 'set',
  });
}

async function main (): Promise<void> {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  await plugin_cleanup().catch(() => {});

  const initialPort = await getFreePort();
  const nextPort = await getFreePort();
  const configPath = path.join(TMP_DIR, 'config.json');
  const initialConfig = makeInitialConfig(initialPort);
  fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), 'utf-8');

  const calls: ActionCall[] = [];
  const logs: CapturedLogs = { info: [], warn: [], error: [] };
  const ctx = makeContext(configPath, { adapter: 'stage8-network-config' }, calls, logs);
  const initialBaseUrl = `http://127.0.0.1:${initialPort}`;
  const nextBaseUrl = `http://127.0.0.1:${nextPort}`;

  try {
    await verifyPluginInit(ctx, logs, initialBaseUrl);
    console.log('ok - plugin init with fake NapCat context');

    await verifyNapCatConfigPageSave(ctx, configPath, nextBaseUrl, initialBaseUrl, nextPort);
    console.log('ok - NapCat config page merge and web hot restart');

    await verifyMessageLifecycle(ctx, calls);
    console.log('ok - plugin_onmessage owner/user command lifecycle');

    await plugin_cleanup();
    await waitForDown(`${nextBaseUrl}/api/health`);
    assert(!getWebServerState().running, 'plugin cleanup should stop web server');
    console.log('ok - plugin cleanup stops runtime resources');

    console.log('stage8 NapCat lifecycle verification passed');
  } finally {
    await plugin_cleanup().catch(() => {});
  }
}

main().catch(error => {
  plugin_cleanup().finally(() => {
    console.error(error);
    process.exit(1);
  });
});
