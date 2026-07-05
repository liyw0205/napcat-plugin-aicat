import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { WebSocket as UndiciWebSocket } from 'undici';
import { DEFAULT_PLUGIN_CONFIG } from '../src/config';
import type { PluginConfig } from '../src/types';
import { normalizePluginConfig } from '../src/core/config-normalizer';
import { initModelCacheStore } from '../src/core/model-cache-store';
import { pluginState } from '../src/core/state';
import { startWebServer, stopWebServer } from '../src/core/web-server';
import { imagePersonaManager } from '../src/image/persona-manager';

const TOKEN = 'stage10-browser-secret';
const TMP_DIR = path.resolve('tmp/stage10-browser-e2e');
const PROFILE_DIR = path.join(TMP_DIR, 'browser-profile');
const UPLOAD_FILE = path.join(TMP_DIR, 'stage10-selfie.png');

interface JsonResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
  text: string;
}

interface BrowserProcess {
  child: ChildProcessWithoutNullStreams;
  stderr: string[];
  exit: { code: number | null; signal: string | null; } | null;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string; data?: string; };
}

interface LayoutReport {
  ok: boolean;
  failures: string[];
  viewport: {
    width: number;
    height: number;
    scrollWidth: number;
  };
}

function assert (condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    await sleep(50);
  }

  throw new Error(`server did not become ready: ${lastError}`);
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
    prefix: '/阶段十',
    botName: '阶段十猫',
    confirmMessage: '阶段十确认消息',
    webEnable: true,
    webHost: '127.0.0.1',
    webPort: port,
    webToken: TOKEN,
    imageMaxImageSizeMB: 1,
    chatChannels: [{
      name: 'stage10-chat',
      base_url: 'https://chat.invalid/v1',
      api_key: 'chat-secret',
      models_cache: ['chat-browser', 'chat-backup'],
      enabled_models: [{ id: 'chat-browser', enabled: true }],
      timeout: 20000,
    }],
    enabledChatModelPriority: ['stage10-chat/chat-browser'],
    imageChannels: [{
      name: 'stage10-image',
      base_url: 'https://image.invalid/v1',
      api_key: 'image-secret',
      provider_type: 'openai',
      models_cache: ['image-browser'],
      enabled_models: [{ id: 'image-browser', enabled: true }],
      timeout: 180000,
    }],
    enabledImageModelPriority: ['stage10-image/image-browser'],
  });
}

function writeTinyPng (file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
  ]));
}

function setupState (port: number): void {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  writeTinyPng(UPLOAD_FILE);

  initModelCacheStore(TMP_DIR);
  imagePersonaManager.init(TMP_DIR);

  pluginState.clearVerificationCleanupInterval();
  pluginState.configPath = path.join(TMP_DIR, 'config.json');
  pluginState.config = makeInitialConfig(port);
  pluginState.setRuntimeConfigSyncer(null);
}

function findOnPath (name: string): string | null {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function findBrowserExecutable (): string | null {
  const envCandidates = [
    process.env.AICAT_BROWSER_EXECUTABLE,
    process.env.CHROMIUM_PATH,
    process.env.CHROME_PATH,
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of envCandidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      throw new Error(`浏览器路径不可执行：${candidate}`);
    }
  }

  for (const name of [
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'chrome',
  ]) {
    const found = findOnPath(name);
    if (found) return found;
  }

  return null;
}

function launchBrowser (executable: string, debugPort: number): BrowserProcess {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const args = [
    '--headless',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--window-size=1280,900',
    'about:blank',
  ];

  const state: BrowserProcess = {
    child: spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] }),
    stderr: [],
    exit: null,
  };

  state.child.stderr.setEncoding('utf8');
  state.child.stderr.on('data', chunk => {
    state.stderr.push(String(chunk));
  });

  state.child.once('exit', (code, signal) => {
    state.exit = { code, signal };
  });

  return state;
}

function stopBrowser (browser: BrowserProcess | null): void {
  if (!browser) return;
  if (browser.child.exitCode !== null || browser.child.killed) return;
  browser.child.kill('SIGTERM');
  setTimeout(() => {
    if (browser.child.exitCode === null) {
      browser.child.kill('SIGKILL');
    }
  }, 1000).unref();
}

async function waitForDebugger (port: number, browser: BrowserProcess, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  let lastError = '';

  while (Date.now() - started < timeoutMs) {
    if (browser.exit) {
      throw new Error(
        `浏览器进程提前退出：code=${browser.exit.code} signal=${browser.exit.signal}\n` +
        browser.stderr.join('').slice(-2000)
      );
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = String(error);
    }

    await sleep(100);
  }

  throw new Error(`浏览器调试端口未就绪：${lastError}\n${browser.stderr.join('').slice(-2000)}`);
}

async function createPageWebSocketUrl (debugPort: number): Promise<string> {
  const targetUrl = `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`;
  const methods = ['PUT', 'GET'];

  for (const method of methods) {
    const res = await fetch(targetUrl, { method });
    if (!res.ok) continue;
    const data = await res.json() as { webSocketDebuggerUrl?: string; };
    if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
  }

  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json() as {
    type?: string;
    webSocketDebuggerUrl?: string;
  }[];
  const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
  if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;

  throw new Error('未能创建浏览器调试页面');
}

class CdpSession {
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private listeners = new Map<string, Set<(params: unknown) => void>>();

  private constructor (private readonly ws: InstanceType<typeof UndiciWebSocket>) {}

  static connect (url: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const ws = new UndiciWebSocket(url);
      const cleanup = (): void => {
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('error', handleError);
      };
      const handleOpen = (): void => {
        cleanup();
        resolve(new CdpSession(ws));
      };
      const handleError = (event: unknown): void => {
        cleanup();
        reject(new Error(`CDP WebSocket 连接失败：${String(event)}`));
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('error', handleError);
    });
  }

  bind (): void {
    this.ws.addEventListener('message', event => {
      this.handleMessage((event as MessageEvent).data);
    });

    this.ws.addEventListener('close', () => {
      for (const [id, item] of this.pending) {
        clearTimeout(item.timer);
        item.reject(new Error(`CDP 连接已关闭，未完成请求：${id}`));
      }
      this.pending.clear();
    });
  }

  on (method: string, listener: (params: unknown) => void): void {
    const set = this.listeners.get(method) || new Set<(params: unknown) => void>();
    set.add(listener);
    this.listeners.set(method, set);
  }

  async send<T = Record<string, unknown>> (
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 5000
  ): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 请求超时：${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer,
      });
      this.ws.send(payload);
    });
  }

  close (): void {
    this.ws.close();
  }

  private handleMessage (data: unknown): void {
    const text = typeof data === 'string'
      ? data
      : Buffer.from(data as ArrayBuffer).toString('utf8');
    const msg = JSON.parse(text) as CdpMessage;

    if (typeof msg.id === 'number') {
      const item = this.pending.get(msg.id);
      if (!item) return;
      clearTimeout(item.timer);
      this.pending.delete(msg.id);

      if (msg.error) {
        item.reject(new Error(`${msg.error.message || 'CDP error'} ${msg.error.data || ''}`.trim()));
      } else {
        item.resolve(msg.result);
      }
      return;
    }

    if (msg.method) {
      for (const listener of this.listeners.get(msg.method) || []) {
        listener(msg.params);
      }
    }
  }
}

function formatException (details: unknown): string {
  const data = details as {
    text?: string;
    exception?: { description?: string; value?: unknown; };
  };
  return data.exception?.description || data.text || String(details);
}

async function evaluate<T = unknown> (cdp: CdpSession, expression: string): Promise<T> {
  const res = await cdp.send<{
    result?: { value?: T; unserializableValue?: string; };
    exceptionDetails?: unknown;
  }>('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, 8000);

  if (res.exceptionDetails) {
    throw new Error(formatException(res.exceptionDetails));
  }

  return res.result?.value as T;
}

async function waitForExpression (
  cdp: CdpSession,
  expression: string,
  message: string,
  timeoutMs = 5000
): Promise<void> {
  const started = Date.now();
  let lastError = '';

  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await evaluate<boolean>(cdp, `(() => {
        try {
          return Boolean(${expression});
        } catch (e) {
          return false;
        }
      })()`);
      if (ok) return;
    } catch (error) {
      lastError = String(error);
    }

    await sleep(50);
  }

  throw new Error(`${message}${lastError ? `：${lastError}` : ''}`);
}

async function navigate (cdp: CdpSession, url: string): Promise<void> {
  await cdp.send('Page.navigate', { url });
  await waitForExpression(
    cdp,
    'document.readyState === "complete"',
    '页面未完成加载',
    8000
  );
}

async function installBrowserHooks (cdp: CdpSession): Promise<void> {
  await evaluate<void>(cdp, `(() => {
    window.__stage10Alerts = [];
    window.alert = message => window.__stage10Alerts.push(String(message || ''));
    window.confirm = () => true;
  })()`);
}

async function clickSelector (cdp: CdpSession, selector: string): Promise<void> {
  await evaluate<void>(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('缺少元素：${selector}');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
  })()`);
}

async function setInputValue (cdp: CdpSession, id: string, value: string | number): Promise<void> {
  await evaluate<void>(cdp, `(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) throw new Error('缺少元素：#${id}');
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function setViewport (
  cdp: CdpSession,
  width: number,
  height: number,
  mobile: boolean
): Promise<void> {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  });
  await evaluate<void>(cdp, 'window.dispatchEvent(new Event("resize")); window.scrollTo(0, 0)');
}

async function checkLayout (cdp: CdpSession, label: string): Promise<void> {
  const report = await evaluate<LayoutReport>(cdp, `(() => {
    const failures = [];
    const selectors = [
      '#saveBtn',
      '#reloadBtn',
      'nav button[data-tab="basic"]',
      'nav button[data-tab="channels"]',
      '#prefix',
      '#botName'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) {
        failures.push(selector + ' 缺失');
        continue;
      }

      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 1 || rect.height < 1) {
        failures.push(selector + ' 不可见');
      }

      if (rect.left < -1 || rect.right > window.innerWidth + 1) {
        failures.push(selector + ' 超出视口');
      }

      if (el.tagName === 'BUTTON') {
        const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
          failures.push(selector + ' 中心点被 ' + hit.tagName.toLowerCase() + ' 覆盖');
        }
      }
    }

    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (scrollWidth - window.innerWidth > 2) {
      failures.push('页面横向溢出：' + scrollWidth + ' > ' + window.innerWidth);
    }

    return {
      ok: failures.length === 0,
      failures,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth
      }
    };
  })()`);

  assert(
    report.ok,
    `${label} 布局检查失败：${report.failures.join('；')}（视口 ${report.viewport.width}x${report.viewport.height}，scrollWidth=${report.viewport.scrollWidth}）`
  );
  console.log(`ok - ${label} 布局可见且关键控件可点击`);
}

async function fetchServerConfig (baseUrl: string): Promise<PluginConfig & { _configRevision?: number; }> {
  const res = await fetchJson<{ success?: boolean; data?: PluginConfig & { _configRevision?: number; }; }>(
    `${baseUrl}/api/config`,
    { headers: authHeaders() }
  );

  assert(res.status === 200 && res.data.success === true && res.data.data, 'server config fetch should succeed');
  return res.data.data;
}

async function verifyTokenLogin (cdp: CdpSession): Promise<void> {
  await waitForExpression(
    cdp,
    '!document.getElementById("appView").classList.contains("hidden")',
    'URL Token 登录后应用视图未显示'
  );

  const state = await evaluate<{
    appHidden: boolean;
    loginHidden: boolean;
    token: string;
    search: string;
    status: string;
  }>(cdp, `(() => ({
    appHidden: document.getElementById('appView').classList.contains('hidden'),
    loginHidden: document.getElementById('loginView').classList.contains('hidden'),
    token: localStorage.getItem('aicat_token') || '',
    search: location.search,
    status: document.getElementById('topStatus').textContent || ''
  }))()`);

  assert(!state.appHidden, 'URL Token 登录后 appView 应可见');
  assert(state.loginHidden, 'URL Token 登录后 loginView 应隐藏');
  assert(state.token === TOKEN, 'URL Token 应保存到 localStorage');
  assert(!state.search.includes('token='), 'URL Token 应从地址栏移除');
  assert(state.status.includes('已连接'), '顶部状态应显示已连接');
  console.log('ok - 真实浏览器 URL Token 登录和地址清理');
}

async function verifyFormSave (cdp: CdpSession, baseUrl: string): Promise<void> {
  await setInputValue(cdp, 'prefix', '/浏览器');
  await setInputValue(cdp, 'botName', '浏览器猫');
  await setInputValue(cdp, 'randomIgnoreQQsText', '20001, 20002');
  await clickSelector(cdp, '#saveBtn');
  await waitForExpression(
    cdp,
    'document.getElementById("topStatus").textContent.includes("已保存")',
    '表单保存后未显示已保存'
  );

  const cfg = await fetchServerConfig(baseUrl);
  assert(cfg.prefix === '/浏览器', '表单保存应持久化中文 prefix');
  assert(cfg.botName === '浏览器猫', '表单保存应持久化中文机器人名称');
  assert(Array.isArray(cfg.randomIgnoreQQs) && cfg.randomIgnoreQQs.includes('20002'), '表单保存应持久化列表字段');
  console.log('ok - 真实浏览器表单保存中文配置');
}

async function verifyConflictRefresh (cdp: CdpSession, baseUrl: string): Promise<void> {
  const before = await fetchServerConfig(baseUrl);
  assert(typeof before._configRevision === 'number', 'server config should include runtime revision');

  pluginState.setWebConfigPatch({
    _configRevision: before._configRevision,
    enabledChatModelPriority: ['stage10-chat/chat-browser'],
    confirmMessage: '阶段十服务端配置为准',
  });

  await setInputValue(cdp, 'prefix', '/浏览器旧页面');
  await clickSelector(cdp, '#saveBtn');

  await waitForExpression(
    cdp,
    `(window.__stage10Alerts || []).some(item => item.includes('配置已被其他入口更新')) &&
      document.getElementById('confirmMessage').value === '阶段十服务端配置为准' &&
      document.getElementById('prefix').value !== '/浏览器旧页面'`,
    '409 冲突后前端未提示并刷新到服务端配置'
  );
  console.log('ok - 真实浏览器 409 冲突提示和配置刷新');
}

async function setFileInputFiles (cdp: CdpSession, selector: string, files: string[]): Promise<void> {
  const doc = await cdp.send<{ root?: { nodeId?: number; }; }>('DOM.getDocument', { depth: -1, pierce: true });
  const rootNodeId = doc.root?.nodeId;
  assert(rootNodeId, 'DOM root node unavailable');

  const node = await cdp.send<{ nodeId?: number; }>('DOM.querySelector', {
    nodeId: rootNodeId,
    selector,
  });
  assert(node.nodeId, `缺少文件输入框：${selector}`);

  await cdp.send('DOM.setFileInputFiles', {
    nodeId: node.nodeId,
    files,
  });
}

async function verifySelfieUpload (cdp: CdpSession): Promise<void> {
  await clickSelector(cdp, 'nav button[data-tab="selfie"]');
  await waitForExpression(
    cdp,
    'Boolean(document.getElementById("selfieUploadFile"))',
    '自拍上传 UI 未注入'
  );

  await setFileInputFiles(cdp, '#selfieUploadFile', [UPLOAD_FILE]);
  await clickSelector(cdp, '#selfieUploadBtn');

  await waitForExpression(
    cdp,
    `document.getElementById('selfieUploadStatus').textContent.includes('当前已设置自拍参考图')`,
    '自拍参考图上传后未刷新预览',
    8000
  );

  const state = await evaluate<{ visible: boolean; src: string; }>(cdp, `(() => {
    const img = document.getElementById('selfieUploadPreview');
    return {
      visible: getComputedStyle(img).display !== 'none',
      src: img.getAttribute('src') || ''
    };
  })()`);
  assert(state.visible, '自拍参考图预览应可见');
  assert(state.src.startsWith('data:image/png;base64,'), '自拍参考图预览应使用 data URL');

  await clickSelector(cdp, '#selfieClearBtn');
  await waitForExpression(
    cdp,
    `document.getElementById('selfieUploadStatus').textContent.includes('当前还没有设置自拍参考图')`,
    '清除自拍参考图后未刷新为空状态',
    8000
  );
  console.log('ok - 真实浏览器文件输入、自拍上传和清除');
}

async function main (): Promise<void> {
  const browserExecutable = findBrowserExecutable();
  if (!browserExecutable) {
    pluginState.clearVerificationCleanupInterval();
    stopWebServer();
    console.log('skip - 未发现 Chromium/Chrome 可执行文件；设置 AICAT_BROWSER_EXECUTABLE 后可启用真实浏览器 E2E');
    return;
  }

  const webPort = await getFreePort();
  const debugPort = await getFreePort();
  setupState(webPort);

  startWebServer({
    port: webPort,
    host: '127.0.0.1',
    token: TOKEN,
    getConfig: () => pluginState.getWebConfigSnapshot(),
    setConfig: patch => pluginState.setWebConfigPatch(patch),
  });

  const baseUrl = `http://127.0.0.1:${webPort}`;
  let browser: BrowserProcess | null = null;
  let cdp: CdpSession | null = null;

  try {
    await waitForOk(`${baseUrl}/api/health`);
    browser = launchBrowser(browserExecutable, debugPort);
    await waitForDebugger(debugPort, browser);

    const wsUrl = await createPageWebSocketUrl(debugPort);
    cdp = await CdpSession.connect(wsUrl);
    cdp.bind();

    cdp.on('Page.javascriptDialogOpening', () => {
      void cdp?.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    await setViewport(cdp, 1280, 900, false);
    await navigate(cdp, `${baseUrl}/?token=${encodeURIComponent(TOKEN)}`);
    await installBrowserHooks(cdp);

    await verifyTokenLogin(cdp);
    await checkLayout(cdp, '桌面端视口');
    await verifyFormSave(cdp, baseUrl);
    await verifyConflictRefresh(cdp, baseUrl);
    await verifySelfieUpload(cdp);

    await clickSelector(cdp, 'nav button[data-tab="basic"]');
    await waitForExpression(
      cdp,
      'document.getElementById("basic").classList.contains("active")',
      '移动端布局检查前未切回基础配置页'
    );
    await setViewport(cdp, 390, 844, true);
    await checkLayout(cdp, '移动端视口');

    console.log('stage10 browser e2e verification passed');
  } finally {
    cdp?.close();
    stopBrowser(browser);
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
