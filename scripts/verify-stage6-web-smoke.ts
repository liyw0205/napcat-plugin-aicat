import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DEFAULT_PLUGIN_CONFIG } from '../src/config';
import type { PluginConfig } from '../src/types';
import { normalizePluginConfig } from '../src/core/config-normalizer';
import { initModelCacheStore } from '../src/core/model-cache-store';
import { pluginState } from '../src/core/state';
import { getWebServerState, startWebServer, stopWebServer } from '../src/core/web-server';
import { imagePersonaManager } from '../src/image/persona-manager';

const TOKEN = 'stage6-secret';
const TMP_DIR = path.resolve('tmp/stage6-web-smoke');

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
    prefix: '/stage6',
    webEnable: true,
    webHost: '127.0.0.1',
    webPort: port,
    webToken: TOKEN,
    imageMaxImageSizeMB: 1,
    chatChannels: [{
      name: 'stage6-chat',
      base_url: 'https://chat.invalid/v1',
      api_key: 'chat-secret',
      models_cache: [],
      enabled_models: [{ id: 'chat-smoke', enabled: true }],
      timeout: 20000,
    }],
    enabledChatModelPriority: ['stage6-chat/chat-smoke'],
    imageChannels: [{
      name: 'stage6-image',
      base_url: 'https://image.invalid/v1',
      api_key: 'image-secret',
      provider_type: 'openai',
      models_cache: [],
      enabled_models: [{ id: 'image-smoke', enabled: true }],
      timeout: 180000,
    }],
    enabledImageModelPriority: ['stage6-image/image-smoke'],
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

async function verifyAssetsAndAuth (baseUrl: string): Promise<void> {
  const index = await fetchText(`${baseUrl}/`);
  assert(index.status === 200, 'admin index should be public');
  assert(index.text.includes('loginToken'), 'admin index should include login form');
  assert(index.text.includes('appView'), 'admin index should include app shell');

  const js = await fetchText(`${baseUrl}/admin.js`);
  assert(js.status === 200, 'admin js should be public');
  assert(js.text.includes("localStorage.setItem('aicat_token'"), 'admin js should persist url token');
  assert(js.text.includes("cleanUrl.searchParams.delete('token')"), 'admin js should clear url token');
  assert(js.text.includes('/api/selfie-reference'), 'admin js should include selfie upload API');
  assert(js.text.includes('selfieUploadBtn'), 'admin js should include selfie upload controls');

  const health = await fetchJson<{ success?: boolean; data?: { host?: string; port?: number; auth?: boolean; }; }>(
    `${baseUrl}/api/health`
  );
  assert(health.status === 200 && health.data.success === true, 'health should be public');
  assert(health.data.data?.auth === true, 'health should expose auth state');

  const noToken = await fetchJson(`${baseUrl}/api/config`);
  assert(noToken.status === 401, 'config without token should be rejected');

  const queryToken = await fetchJson<{ success?: boolean; data?: Record<string, unknown>; }>(
    `${baseUrl}/api/config?token=${TOKEN}`
  );
  assert(queryToken.status === 200 && queryToken.data.success === true, 'query token should authenticate config');
  assert(
    typeof queryToken.data.data?._configRevision === 'number',
    'config response should include runtime revision'
  );
}

async function verifyConfigSaveAndConflict (baseUrl: string): Promise<void> {
  const initial = await fetchJson<{ success?: boolean; data?: PluginConfig & { _configRevision?: number; }; }>(
    `${baseUrl}/api/config`,
    { headers: authHeaders() }
  );
  assert(initial.status === 200 && initial.data.success === true, 'config get with token should succeed');

  const revision = Number(initial.data.data?._configRevision);
  assert(Number.isFinite(revision), 'config get should include numeric revision');

  const save = await fetchJson<{ success?: boolean; data?: PluginConfig & { _configRevision?: number; }; }>(
    `${baseUrl}/api/config`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        config: {
          _configRevision: revision,
          prefix: '/stage6-updated',
          webToken: TOKEN,
        },
      }),
    }
  );

  assert(save.status === 200 && save.data.success === true, 'simple config save should succeed');
  assert(save.data.data?.prefix === '/stage6-updated', 'config save should update prefix');
  assert(
    Number(save.data.data?._configRevision) > revision,
    'config save should increment runtime revision'
  );

  const savedRaw = JSON.parse(fs.readFileSync(pluginState.configPath, 'utf-8')) as Record<string, unknown>;
  assert(!('_configRevision' in savedRaw), 'saved config file should not include runtime revision');
  assert(Array.isArray(savedRaw.chatChannels) && savedRaw.chatChannels.length === 1, 'chat channel should survive save');
  assert(Array.isArray(savedRaw.imageChannels) && savedRaw.imageChannels.length === 1, 'image channel should survive save');

  const staleConflict = await fetchJson(`${baseUrl}/api/config`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      config: {
        _configRevision: revision,
        chatChannels: [],
      },
    }),
  });
  assert(staleConflict.status === 409, 'stale guarded config save should return 409');

  const missingRevisionConflict = await fetchJson(`${baseUrl}/api/config`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      config: {
        imageChannels: [],
      },
    }),
  });
  assert(missingRevisionConflict.status === 409, 'guarded config save without revision should return 409');

  const afterConflict = await fetchJson<{ success?: boolean; data?: PluginConfig; }>(
    `${baseUrl}/api/config`,
    { headers: authHeaders() }
  );
  assert(
    afterConflict.data.data?.chatChannels?.length === 1 &&
      afterConflict.data.data?.imageChannels?.length === 1,
    'conflicted save should not mutate channel config'
  );
}

async function verifySelfieReferenceApi (baseUrl: string): Promise<void> {
  const empty = await fetchJson<{ success?: boolean; data?: { has_image?: boolean; }; }>(
    `${baseUrl}/api/selfie-reference`,
    { headers: authHeaders() }
  );
  assert(empty.status === 200 && empty.data.data?.has_image === false, 'selfie reference should start empty');

  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

  const upload = await fetchJson<{ success?: boolean; data?: { has_image?: boolean; image?: string; ref_mime_type?: string; }; }>(
    `${baseUrl}/api/selfie-reference`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        image: dataUrl,
        mime_type: 'image/png',
        filename: 'stage6.png',
      }),
    }
  );

  assert(upload.status === 200 && upload.data.success === true, 'selfie upload should succeed');
  assert(upload.data.data?.has_image === true, 'selfie upload should set reference image');
  assert(upload.data.data?.ref_mime_type === 'image/png', 'selfie upload should keep mime type');
  assert(
    String(upload.data.data?.image || '').startsWith('data:image/png;base64,'),
    'selfie upload response should include preview data url'
  );

  const clear = await fetchJson<{ success?: boolean; data?: { has_image?: boolean; }; }>(
    `${baseUrl}/api/selfie-reference/clear`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    }
  );

  assert(clear.status === 200 && clear.data.data?.has_image === false, 'selfie clear should remove reference image');
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
    assert(getWebServerState().running, 'web server should be running');

    await verifyAssetsAndAuth(baseUrl);
    console.log('ok - web assets and token auth');

    await verifyConfigSaveAndConflict(baseUrl);
    console.log('ok - web config save and conflict handling');

    await verifySelfieReferenceApi(baseUrl);
    console.log('ok - selfie reference upload api');

    console.log('stage6 web smoke verification passed');
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
