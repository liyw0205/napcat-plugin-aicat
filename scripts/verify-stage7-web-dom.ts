import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { DEFAULT_PLUGIN_CONFIG } from '../src/config';
import type { PluginConfig } from '../src/types';
import { normalizePluginConfig } from '../src/core/config-normalizer';
import { initModelCacheStore } from '../src/core/model-cache-store';
import { pluginState } from '../src/core/state';
import { startWebServer, stopWebServer } from '../src/core/web-server';
import { imagePersonaManager } from '../src/image/persona-manager';

const TOKEN = 'stage7-secret';
const TMP_DIR = path.resolve('tmp/stage7-web-dom');

interface JsonResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
  text: string;
}

type DomEnv = {
  window: any;
  document: any;
  alerts: string[];
  storage: Map<string, string>;
};

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

async function fetchText (url: string, init?: RequestInit): Promise<{ status: number; text: string; }> {
  const res = await fetch(url, init);
  return {
    status: res.status,
    text: await res.text(),
  };
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

function authHeaders (): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-aicat-token': TOKEN,
  };
}

function makeInitialConfig (port: number): PluginConfig {
  return normalizePluginConfig({
    ...DEFAULT_PLUGIN_CONFIG,
    prefix: '/stage7',
    botName: 'Stage7Cat',
    confirmMessage: 'stage7-confirm',
    webEnable: true,
    webHost: '127.0.0.1',
    webPort: port,
    webToken: TOKEN,
    imageMaxImageSizeMB: 1,
    chatChannels: [{
      name: 'stage7-chat',
      base_url: 'https://chat.invalid/v1',
      api_key: 'chat-secret',
      models_cache: ['chat-dom', 'chat-alt'],
      enabled_models: [{ id: 'chat-dom', enabled: true }],
      timeout: 20000,
    }],
    enabledChatModelPriority: ['stage7-chat/chat-dom'],
    imageChannels: [{
      name: 'stage7-image',
      base_url: 'https://image.invalid/v1',
      api_key: 'image-secret',
      provider_type: 'openai',
      models_cache: ['image-dom'],
      enabled_models: [{ id: 'image-dom', enabled: true }],
      timeout: 180000,
    }],
    enabledImageModelPriority: ['stage7-image/image-dom'],
  });
}

function setupState (port: number): void {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  initModelCacheStore(TMP_DIR);
  imagePersonaManager.init(TMP_DIR);

  pluginState.clearVerificationCleanupInterval();
  pluginState.configPath = path.join(TMP_DIR, 'config.json');
  pluginState.config = makeInitialConfig(port);
  pluginState.setRuntimeConfigSyncer(null);
}

function resolveClientUrl (baseUrl: string, input: string): string {
  return new URL(input, baseUrl).toString();
}

function createLocalStorage (storage: Map<string, string>): Storage {
  return {
    get length () {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: key => storage.get(String(key)) ?? null,
    key: index => Array.from(storage.keys())[index] ?? null,
    removeItem: key => storage.delete(String(key)),
    setItem: (key, value) => storage.set(String(key), String(value)),
  } as Storage;
}

function createLocation (initialUrl: string): {
  location: Record<string, string>;
  history: { replaceState: (_state: unknown, _title: string, url?: string | null) => void; };
} {
  let current = new URL(initialUrl);

  const location = {
    get href () { return current.href; },
    set href (value: string) { current = new URL(value, current); },
    get origin () { return current.origin; },
    get protocol () { return current.protocol; },
    get host () { return current.host; },
    get hostname () { return current.hostname; },
    get port () { return current.port; },
    get pathname () { return current.pathname; },
    set pathname (value: string) {
      current = new URL(value + current.search + current.hash, current.origin);
    },
    get search () { return current.search; },
    set search (value: string) {
      const next = new URL(current.href);
      next.search = value;
      current = next;
    },
    get hash () { return current.hash; },
    set hash (value: string) {
      const next = new URL(current.href);
      next.hash = value;
      current = next;
    },
    toString: () => current.href,
  };

  return {
    location,
    history: {
      replaceState: (_state, _title, url) => {
        if (url !== undefined && url !== null) current = new URL(url, current);
      },
    },
  };
}

function installFileReader (window: any): void {
  window.FileReader = class {
    result: string | ArrayBuffer | null = null;
    onload: null | (() => void) = null;
    onerror: null | ((error: unknown) => void) = null;

    async readAsDataURL (file: { type?: string; arrayBuffer: () => Promise<ArrayBuffer>; }): Promise<void> {
      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        const mime = file.type || 'application/octet-stream';
        this.result = `data:${mime};base64,${bytes.toString('base64')}`;
        this.onload?.();
      } catch (error) {
        this.onerror?.(error);
      }
    }
  };
}

function installClientGlobals (window: any, baseUrl: string, alerts: string[], storage: Map<string, string>): void {
  const { location, history } = createLocation(`${baseUrl}/?token=${encodeURIComponent(TOKEN)}`);
  const localStorage = createLocalStorage(storage);
  const nodeFetch = globalThis.fetch.bind(globalThis);
  const BrowserURL = URL as unknown as typeof URL & {
    createObjectURL?: (value: unknown) => string;
    revokeObjectURL?: (value: string) => void;
  };

  BrowserURL.createObjectURL = () => 'blob:stage7-dom';
  BrowserURL.revokeObjectURL = () => {};

  Object.assign(window, {
    console,
    Event: window.Event,
    File: window.File,
    Blob: window.Blob,
    MutationObserver: window.MutationObserver,
    fetch: (input: string | URL, init?: RequestInit) => {
      const target = typeof input === 'string' && input.startsWith('/')
        ? resolveClientUrl(baseUrl, input)
        : String(input);
      return nodeFetch(target, init);
    },
    alert: (message: unknown) => alerts.push(String(message || '')),
    confirm: () => true,
    prompt: () => '',
    localStorage,
    sessionStorage: createLocalStorage(new Map()),
    history,
    location,
    URL: BrowserURL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });

  installFileReader(window);
}

async function createDomEnv (baseUrl: string): Promise<DomEnv> {
  const index = await fetchText(`${baseUrl}/`);
  assert(index.status === 200, 'admin index should load');

  const js = await fetchText(`${baseUrl}/admin.js`);
  assert(js.status === 200, 'admin js should load');

  const { window, document } = parseHTML(index.text);
  const alerts: string[] = [];
  const storage = new Map<string, string>();

  Object.assign(window, {
    window,
    self: window,
    globalThis: window,
    document,
  });
  installClientGlobals(window, baseUrl, alerts, storage);
  window.eval(js.text);

  return { window, document, alerts, storage };
}

function byId<T = any> (document: any, id: string): T {
  const element = document.getElementById(id);
  assert(element, `missing element #${id}`);
  return element as T;
}

function click (document: any, id: string): void {
  byId(document, id).click();
}

function setValue (document: any, id: string, value: string | number): void {
  const element = byId(document, id);
  element.value = String(value);
}

function isHidden (element: any): boolean {
  return element.classList.contains('hidden');
}

async function waitFor (check: () => unknown, message: string, timeoutMs = 3000): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw new Error(message);
}

async function waitForStatus (document: any, text: string, timeoutMs = 3000): Promise<void> {
  await waitFor(
    () => String(byId(document, 'topStatus').textContent || '').includes(text),
    `top status did not become ${text}`,
    timeoutMs
  );
}

function getAdvancedConfig (document: any): Record<string, unknown> {
  return JSON.parse(String(byId(document, 'fullConfig').value || '{}')) as Record<string, unknown>;
}

async function fetchServerConfig (baseUrl: string): Promise<PluginConfig & { _configRevision?: number; }> {
  const res = await fetchJson<{ success?: boolean; data?: PluginConfig & { _configRevision?: number; }; }>(
    `${baseUrl}/api/config`,
    { headers: authHeaders() }
  );

  assert(res.status === 200 && res.data.success === true && res.data.data, 'server config fetch should succeed');
  return res.data.data;
}

async function verifyTokenLogin (env: DomEnv): Promise<void> {
  const { document, storage, window } = env;

  try {
    await waitFor(
      () => !isHidden(byId(document, 'appView')),
      'app view should be visible after url token login'
    );
  } catch (error) {
    throw new Error(
      `${String(error)}; topStatus=${String(byId(document, 'topStatus').textContent || '')}; ` +
      `loginStatus=${String(byId(document, 'loginStatus').textContent || '')}; ` +
      `token=${storage.get('aicat_token') || ''}; search=${String(window.location.search || '')}`
    );
  }

  assert(isHidden(byId(document, 'loginView')), 'login view should be hidden after url token login');
  assert(storage.get('aicat_token') === TOKEN, 'url token should be persisted to local storage');
  assert(!String(window.location.search || '').includes('token='), 'url token should be removed from address');
  assert(String(byId(document, 'topStatus').textContent || '').includes('已连接'), 'top status should be connected');
}

async function verifyFormSave (env: DomEnv, baseUrl: string): Promise<void> {
  const { document } = env;

  setValue(document, 'prefix', '/stage7-dom');
  setValue(document, 'botName', 'DomCat');
  setValue(document, 'randomIgnoreQQsText', '10001, 10002');
  click(document, 'saveBtn');
  await waitForStatus(document, '已保存');

  const cfg = await fetchServerConfig(baseUrl);
  assert(cfg.prefix === '/stage7-dom', 'form save should persist prefix');
  assert(cfg.botName === 'DomCat', 'form save should persist bot name');
  assert(Array.isArray(cfg.randomIgnoreQQs) && cfg.randomIgnoreQQs.includes('10002'), 'form save should persist list fields');
}

async function verifyChannelModal (env: DomEnv, baseUrl: string): Promise<void> {
  const { document } = env;

  document.querySelector('nav button[data-tab="channels"]').click();
  click(document, 'addChatBtn');

  await waitFor(
    () => byId(document, 'channelModal').classList.contains('show'),
    'channel modal should open'
  );

  setValue(document, 'mName', 'stage7-added-chat');
  setValue(document, 'mBase', 'https://added-chat.invalid/v1');
  setValue(document, 'mKey', 'added-secret');
  setValue(document, 'mTimeout', '12345');
  click(document, 'mEnableAll');
  click(document, 'saveModal');

  await waitFor(
    () => !byId(document, 'channelModal').classList.contains('show'),
    'channel modal should close after save'
  );

  assert(String(byId(document, 'chatList').textContent || '').includes('stage7-added-chat'), 'added channel should render in list');

  click(document, 'saveBtn');
  await waitForStatus(document, '已保存');

  const cfg = await fetchServerConfig(baseUrl);
  const added = cfg.chatChannels?.find(ch => ch.name === 'stage7-added-chat');
  assert(added, 'modal channel save should persist after form save');
  assert(added?.base_url === 'https://added-chat.invalid', 'modal channel should keep normalized base url');
  assert(added?.timeout === 12345, 'modal channel should keep timeout');
}

async function verifyAdvancedJson (env: DomEnv, baseUrl: string): Promise<void> {
  const { document } = env;

  document.querySelector('nav button[data-tab="advanced"]').click();

  const cfg = getAdvancedConfig(document);
  assert(typeof cfg._configRevision === 'number', 'advanced json should include runtime revision for guarded saves');
  cfg.confirmMessage = 'stage7-json-confirm';
  cfg.imageDefaultResolution = '2K';
  byId(document, 'fullConfig').value = JSON.stringify(cfg, null, 2);

  click(document, 'saveJsonBtn');
  await waitForStatus(document, '已保存');

  const saved = await fetchServerConfig(baseUrl);
  assert(saved.confirmMessage === 'stage7-json-confirm', 'advanced json should persist confirm message');
  assert(saved.imageDefaultResolution === '2K', 'advanced json should persist image setting');
}

async function verifyConflictRefresh (env: DomEnv): Promise<void> {
  const { document, alerts } = env;
  const before = getAdvancedConfig(document);
  const staleRevision = Number(before._configRevision);
  assert(Number.isFinite(staleRevision), 'frontend config should have revision before conflict test');

  pluginState.setWebConfigPatch({
    _configRevision: staleRevision,
    enabledChatModelPriority: ['stage7-chat/chat-dom'],
    confirmMessage: 'stage7-server-wins',
  });

  setValue(document, 'prefix', '/stage7-stale-submit');
  click(document, 'saveBtn');

  await waitFor(
    () => alerts.some(item => item.includes('配置已被其他入口更新')) &&
      String(byId(document, 'topStatus').textContent || '').includes('已连接'),
    '409 conflict should alert and reload latest config'
  );

  assert(byId(document, 'confirmMessage').value === 'stage7-server-wins', '409 reload should refresh latest server config');
  assert(byId(document, 'prefix').value !== '/stage7-stale-submit', '409 conflict should discard stale form mutation after reload');
}

function setFileInput (input: any, files: unknown[]): void {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
}

async function verifySelfieUploadUi (env: DomEnv): Promise<void> {
  const { document, window } = env;

  document.querySelector('nav button[data-tab="selfie"]').click();
  await waitFor(
    () => byId(document, 'selfieUploadCard'),
    'selfie upload ui should be injected'
  );

  const fileInput = byId(document, 'selfieUploadFile');
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const file = new window.File([png], 'stage7.png', { type: 'image/png' });
  setFileInput(fileInput, [file]);

  click(document, 'selfieUploadBtn');

  await waitFor(
    () => String(byId(document, 'selfieUploadStatus').textContent || '').includes('当前已设置自拍参考图'),
    'selfie upload should finish and refresh preview'
  );

  const preview = byId(document, 'selfieUploadPreview');
  assert(String(preview.src || '').startsWith('data:image/png;base64,'), 'selfie preview should use uploaded data url');
  assert(preview.style.display === 'block', 'selfie preview should be visible');

  click(document, 'selfieClearBtn');

  await waitFor(
    () => String(byId(document, 'selfieUploadStatus').textContent || '').includes('当前还没有设置自拍参考图'),
    'selfie clear should refresh empty state'
  );
}

async function main (): Promise<void> {
  const port = await getFreePort();
  setupState(port);

  startWebServer({
    port,
    host: '127.0.0.1',
    token: TOKEN,
    getConfig: () => pluginState.getWebConfigSnapshot(),
    setConfig: patch => pluginState.setWebConfigPatch(patch),
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForOk(`${baseUrl}/api/health`);
    const env = await createDomEnv(baseUrl);

    await verifyTokenLogin(env);
    console.log('ok - dom token login and url cleanup');

    await verifyFormSave(env, baseUrl);
    console.log('ok - dom form save');

    await verifyChannelModal(env, baseUrl);
    console.log('ok - dom channel modal save');

    await verifyAdvancedJson(env, baseUrl);
    console.log('ok - dom advanced json save');

    await verifyConflictRefresh(env);
    console.log('ok - dom 409 conflict refresh');

    await verifySelfieUploadUi(env);
    console.log('ok - dom selfie upload ui');

    console.log('stage7 web dom verification passed');
  } finally {
    pluginState.config = {
      ...pluginState.config,
      webEnable: false,
    };
    pluginState.clearVerificationCleanupInterval();
    stopWebServer();
  }
}

main().catch(error => {
  stopWebServer();
  console.error(error);
  process.exit(1);
});
