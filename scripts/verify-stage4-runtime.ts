import http from 'node:http';
import net from 'node:net';
import { DEFAULT_PLUGIN_CONFIG } from '../src/config';
import type { ImageChannelConfig, ImageModelTarget, PluginConfig, Tool } from '../src/types';
import { startWebServer, stopWebServer, getWebServerState } from '../src/core/web-server';
import { pluginState } from '../src/core/state';
import { fetchImageModelsForChannel } from '../src/tools/model-discovery';
import { generateImageWithFallback } from '../src/image/generator';
import {
  filterToolsForUser,
  validateApiToolPermission,
  validateMessageToolResultScope,
  validateMessageToolScope,
} from '../src/tools/ai-permissions';

type TestFn = () => Promise<void> | void;

interface ProxyState {
  httpRequests: number;
  connectRequests: number;
  targets: string[];
}

function assert (condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function test (name: string, fn: TestFn): Promise<void> {
  await fn();
  console.log(`ok - ${name}`);
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

async function readBody (req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

function createUpstream (): http.Server {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
  ]);

  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'stage4-image-model' }] }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/images/generations') {
      await readBody(req);
      const host = req.headers.host || 'stage4.invalid';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ url: `http://${host}/image.png` }] }));
      return;
    }

    if (req.method === 'GET' && req.url === '/image.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
      return;
    }

    if (req.method === 'POST' && req.url === '/v1beta/models/gemini-test:generateContent') {
      await readBody(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              inline_data: {
                data: png.toString('base64'),
              },
            }],
          },
        }],
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`not found: ${req.method} ${req.url}`);
  });
}

function rewriteStage4Url (target: URL, upstreamPort: number): string {
  const port = target.port || String(upstreamPort);
  const host = target.hostname === 'stage4.invalid' ? '127.0.0.1' : target.hostname;
  return `${target.protocol}//${host}:${port}${target.pathname}${target.search}`;
}

function createProxy (state: ProxyState, upstreamPort: number): http.Server {
  const server = http.createServer(async (clientReq, clientRes) => {
    state.httpRequests++;
    state.targets.push(`${clientReq.method || 'GET'} ${clientReq.url || ''}`);

    let target: URL;
    try {
      target = new URL(clientReq.url || '');
    } catch {
      clientRes.writeHead(400);
      clientRes.end('bad proxy url');
      return;
    }

    const body = await readBody(clientReq);
    const headers = { ...clientReq.headers };
    delete headers['proxy-connection'];

    try {
      const upstreamRes = await fetch(rewriteStage4Url(target, upstreamPort), {
        method: clientReq.method,
        headers: headers as Record<string, string>,
        body: body.byteLength ? body : undefined,
      });

      clientRes.writeHead(upstreamRes.status, Object.fromEntries(upstreamRes.headers.entries()));
      clientRes.end(Buffer.from(await upstreamRes.arrayBuffer()));
    } catch (error) {
      clientRes.writeHead(502);
      clientRes.end(String(error));
    }
  });

  server.on('connect', (req, clientSocket, head) => {
    state.connectRequests++;
    state.targets.push(`CONNECT ${req.url || ''}`);

    const [host, portText] = String(req.url || '').split(':');
    const port = Number(portText || upstreamPort);
    const targetHost = host === 'stage4.invalid' ? '127.0.0.1' : host;

    const upstreamSocket = net.connect(port, targetHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });

    upstreamSocket.on('error', () => clientSocket.destroy());
  });

  return server;
}

function makeConfig (): PluginConfig {
  return {
    ...DEFAULT_PLUGIN_CONFIG,
    webToken: 'stage4-secret',
  };
}

async function verifyWebServer (): Promise<void> {
  stopWebServer();
  const port = await getFreePort();
  const config = makeConfig();

  const options = {
    port,
    host: '127.0.0.1',
    token: '',
    getConfig: () => config,
    setConfig: () => config,
  };

  startWebServer(options);
  assert(!getWebServerState().running, 'empty token should not start web server');

  startWebServer({ ...options, token: 'changeme' });
  assert(!getWebServerState().running, 'changeme token should not start web server');

  let conflict = false;
  startWebServer({
    ...options,
    token: 'stage4-secret',
    setConfig: patch => {
      if (conflict || patch.forceConflict) {
        const err = new Error('revision conflict') as Error & {
          code: 'CONFIG_CONFLICT';
          currentRevision: number;
          incomingRevision: number;
        };
        err.code = 'CONFIG_CONFLICT';
        err.currentRevision = 2;
        err.incomingRevision = 1;
        throw err;
      }

      return config;
    },
  });

  await waitForOk(`http://127.0.0.1:${port}/api/health`);

  let state = getWebServerState();
  assert(state.running && state.host === '127.0.0.1' && state.auth, 'web server should run on 127.0.0.1 with auth');

  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json() as {
    data?: { host?: string; port?: number; auth?: boolean; };
  };
  assert(health.data?.host === '127.0.0.1', 'health should expose listen host');
  assert(health.data?.port === port, 'health should expose port');
  assert(health.data?.auth === true, 'health should expose auth state');

  const noToken = await fetch(`http://127.0.0.1:${port}/api/config`);
  assert(noToken.status === 401, 'config without token should be 401');

  const wrongToken = await fetch(`http://127.0.0.1:${port}/api/config`, {
    headers: { 'x-aicat-token': 'wrong' },
  });
  assert(wrongToken.status === 401, 'config with wrong token should be 401');

  const bearer = await fetch(`http://127.0.0.1:${port}/api/config`, {
    headers: { authorization: 'Bearer stage4-secret' },
  });
  assert(bearer.status === 200, 'config with bearer token should be 200');

  const xToken = await fetch(`http://127.0.0.1:${port}/api/config`, {
    headers: { 'x-aicat-token': 'stage4-secret' },
  });
  assert(xToken.status === 200, 'config with x-aicat-token should be 200');

  const legacyXToken = await fetch(`http://127.0.0.1:${port}/api/config`, {
    headers: { 'x-token': 'stage4-secret' },
  });
  assert(legacyXToken.status === 200, 'config with x-token should be 200');

  const queryToken = await fetch(`http://127.0.0.1:${port}/api/config?token=stage4-secret`);
  assert(queryToken.status === 200, 'config with query token should be 200');

  conflict = true;
  const conflictRes = await fetch(`http://127.0.0.1:${port}/api/config`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-aicat-token': 'stage4-secret',
    },
    body: JSON.stringify({ config: { forceConflict: true } }),
  });
  assert(conflictRes.status === 409, 'config conflict should map to 409');

  startWebServer({
    ...options,
    host: '0.0.0.0',
    token: 'stage4-secret',
  });

  await waitForOk(`http://127.0.0.1:${port}/api/health`);
  state = getWebServerState();
  assert(state.running && state.host === '0.0.0.0', 'web server should restart on 0.0.0.0');

  stopWebServer();
  assert(!getWebServerState().running, 'stopWebServer should stop the singleton');
}

async function verifyWebMonitorRestart (): Promise<void> {
  stopWebServer();
  pluginState.clearVerificationCleanupInterval();

  const port = await getFreePort();
  pluginState.config = {
    ...DEFAULT_PLUGIN_CONFIG,
    webEnable: false,
    webHost: '127.0.0.1',
    webPort: port,
    webToken: 'stage4-secret',
  };

  pluginState.setVerificationCleanupInterval(setInterval(() => {}, 60000));

  try {
    assert(!getWebServerState().running, 'web server should stay stopped while disabled');

    pluginState.config = {
      ...pluginState.config,
      webEnable: true,
    };

    await waitForOk(`http://127.0.0.1:${port}/api/health`, 4500);

    const state = getWebServerState();
    assert(state.running && state.port === port, 'web monitor should restart after cleanup and init');
  } finally {
    pluginState.config = {
      ...pluginState.config,
      webEnable: false,
    };
    pluginState.clearVerificationCleanupInterval();
    stopWebServer();
  }
}

function imageChannel (baseUrl: string, proxy: string): ImageChannelConfig {
  return {
    name: 'stage4-image',
    base_url: baseUrl,
    api_key: '',
    provider_type: 'openai',
    models_cache: [],
    enabled_models: [],
    timeout: 10000,
    proxy,
  };
}

function imageTarget (
  providerType: ImageModelTarget['providerType'],
  baseUrl: string,
  proxy: string,
  model: string
): ImageModelTarget {
  return {
    channelName: `stage4-${providerType}`,
    model,
    providerType,
    baseUrl,
    apiKey: '',
    timeout: 10000,
    proxy,
  };
}

async function verifyImageProxy (): Promise<void> {
  const upstream = createUpstream();
  const proxyState: ProxyState = { httpRequests: 0, connectRequests: 0, targets: [] };
  let proxy: http.Server | null = null;

  try {
    const upstreamPort = await listen(upstream);
    proxy = createProxy(proxyState, upstreamPort);
    const proxyPort = await listen(proxy);
    const baseUrl = `http://stage4.invalid:${upstreamPort}`;
    const proxyUrl = `http://127.0.0.1:${proxyPort}`;

    const models = await fetchImageModelsForChannel(imageChannel(baseUrl, proxyUrl));
    assert(models.includes('stage4-image-model'), 'image model discovery should use proxy');

    const openai = await generateImageWithFallback(
      [imageTarget('openai', baseUrl, proxyUrl, 'dall-e-3')],
      { prompt: 'stage4 proxy image' }
    );
    assert(!openai.error, `openai image generation failed: ${openai.error}`);
    assert(openai.images?.[0]?.byteLength, 'openai image generation should download returned image url');

    const gemini = await generateImageWithFallback(
      [imageTarget('gemini', baseUrl, proxyUrl, 'gemini-test')],
      { prompt: 'stage4 gemini image' }
    );
    assert(!gemini.error, `gemini image generation failed: ${gemini.error}`);
    assert(gemini.images?.[0]?.byteLength, 'gemini image generation should return inline image');

    assert(
      proxyState.httpRequests + proxyState.connectRequests >= 3,
      `expected proxy traffic, got ${JSON.stringify(proxyState)}`
    );
  } finally {
    await Promise.allSettled([
      proxy ? closeServer(proxy) : Promise.resolve(),
      closeServer(upstream),
    ]);
  }
}

function tool (name: string): Tool {
  return {
    type: 'function',
    function: {
      name,
      description: name,
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  };
}

function verifyAiPermissions (): void {
  const filtered = filterToolsForUser(
    [
      tool('query_error_logs'),
      tool('list_custom_commands'),
      tool('list_scheduled_tasks'),
      tool('list_user_watchers'),
      tool('web_search'),
    ],
    false
  ).map(item => item.function.name);

  assert(filtered.length === 1 && filtered[0] === 'web_search', 'non-owner tools should hide owner-only tools');

  assert(
    validateApiToolPermission('get_friend_list', {}, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: true,
      userId: '200',
    }),
    'owner-only API should reject non-owner'
  );

  assert(
    validateApiToolPermission('delete_msg', {}, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: false,
      userId: '200',
    }),
    'admin API should reject non-admin'
  );

  assert(
    validateApiToolPermission('delete_msg', {}, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: true,
      userId: '200',
    }) === null,
    'admin API should allow admin'
  );

  assert(
    validateApiToolPermission('send_group_msg', { group_id: '101' }, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: true,
      userId: '200',
    }),
    'group API should reject cross-group access'
  );

  const groupParams: Record<string, unknown> = {};
  assert(
    validateApiToolPermission('send_group_msg', groupParams, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: true,
      userId: '200',
    }) === null && groupParams.group_id === '100',
    'send_group_msg should fill current group'
  );

  assert(
    validateApiToolPermission('send_group_msg', {}, {
      isOwnerUser: false,
      isAdmin: true,
      userId: '200',
    }),
    'send_group_msg should reject private context'
  );

  const privateParams: Record<string, unknown> = {};
  assert(
    validateApiToolPermission('send_private_msg', privateParams, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: true,
      userId: '200',
    }) === null && privateParams.user_id === '200',
    'send_private_msg should fill current user'
  );

  assert(
    validateApiToolPermission('send_private_msg', { user_id: '201' }, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: true,
      userId: '200',
    }),
    'send_private_msg should reject other users'
  );

  const msgArgs: Record<string, unknown> = {};
  assert(
    validateMessageToolScope('search_messages', msgArgs, '100', false) === null &&
      msgArgs.group_id === '100',
    'message search should fill current group for non-owner'
  );

  assert(
    validateMessageToolScope('search_messages', {}, undefined, false),
    'message search should reject private global query for non-owner'
  );

  assert(
    validateMessageToolScope('search_messages', { group_id: '101' }, '100', false),
    'message search should reject cross-group query for non-owner'
  );

  assert(
    validateMessageToolScope('search_messages', {}, undefined, true) === null,
    'owner may query messages globally'
  );

  assert(
    validateMessageToolResultScope(
      'get_message_by_id',
      { success: true, data: { group_id: '101' } },
      '100',
      false
    ),
    'get_message_by_id should reject cross-group result for non-owner'
  );

  assert(
    validateMessageToolResultScope(
      'get_message_by_id',
      { success: true, data: { group_id: '' } },
      '100',
      false
    ),
    'get_message_by_id should reject private result for non-owner in group'
  );

  assert(
    validateMessageToolResultScope(
      'get_message_by_id',
      { success: true, data: { group_id: '100' } },
      '100',
      false
    ) === null,
    'get_message_by_id should allow current group result for non-owner'
  );

  assert(
    validateMessageToolResultScope(
      'get_message_by_id',
      { success: true, data: { group_id: '' } },
      undefined,
      false
    ),
    'get_message_by_id should reject private result for non-owner in private chat'
  );
}

async function main (): Promise<void> {
  try {
    await test('web server auth and restart policy', verifyWebServer);
    await test('web monitor restart after cleanup', verifyWebMonitorRestart);
    await test('image model and adapter proxy path', verifyImageProxy);
    await test('ai permission pure helpers', verifyAiPermissions);
    console.log('stage4 runtime verification passed');
  } finally {
    pluginState.clearVerificationCleanupInterval();
  }
}

main().catch(error => {
  stopWebServer();
  console.error(error);
  process.exit(1);
});
