import type { ActionMap } from 'napcat-types/napcat-onebot/action/index';
import type { PluginLogger } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { NetworkAdapterConfig } from 'napcat-types/napcat-onebot/config/config';
import type { PluginConfig } from '../types';
import { DEFAULT_PLUGIN_CONFIG } from '../config';
import { normalizePluginConfig } from './config-normalizer';
import { startWebServer, stopWebServer } from './web-server';
import fs from 'fs';
import path from 'path';
import {
  extractAndPersistModelCaches,
  stripModelCachesFromConfig,
  mergeModelCachesIntoConfig,
} from './model-cache-store';

const WEB_CONFIG_REVISION_KEY = '_configRevision';
const WEB_CONFIG_REVISION_GUARDED_KEYS = new Set([
  'chatChannels',
  'imageChannels',
  'enabledChatModelPriority',
  'enabledImageModelPriority',
]);

function stripRuntimeConfigMeta<T extends Record<string, unknown>> (input: T): T {
  const cloned = { ...(input || {}) };
  delete cloned[WEB_CONFIG_REVISION_KEY];
  return cloned as T;
}

function getIncomingConfigRevision (patch: Record<string, unknown>): number | null {
  const raw = patch[WEB_CONFIG_REVISION_KEY];
  if (raw === undefined || raw === null || raw === '') return null;

  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function touchesRevisionGuardedConfig (patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some(key => WEB_CONFIG_REVISION_GUARDED_KEYS.has(key));
}

function createConfigConflictError (
  incomingRevision: number | null,
  currentRevision: number
): Error & { code: 'CONFIG_CONFLICT'; currentRevision: number; incomingRevision: number; } {
  const incomingText = incomingRevision === null ? '缺失' : String(incomingRevision);
  const error = new Error(
    `配置已被其他入口更新或提交缺少版本，请刷新 Web 面板后重试。当前版本: ${currentRevision}，提交版本: ${incomingText}`
  ) as Error & { code: 'CONFIG_CONFLICT'; currentRevision: number; incomingRevision: number; };

  error.code = 'CONFIG_CONFLICT';
  error.currentRevision = currentRevision;
  error.incomingRevision = incomingRevision ?? -1;
  return error;
}

class PluginState {
  logger: PluginLogger | null = null;
  actions: ActionMap | undefined;
  adapterName = '';
  networkConfig: NetworkAdapterConfig | null = null;
  config: PluginConfig = { ...DEFAULT_PLUGIN_CONFIG };
  configPath = '';
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private webMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private lastWebSignature = '';
  private runtimeConfigSyncer: (() => void) | null = null;
  private configRevision = 0;

  constructor () {
    this.startWebMonitor();
  }

  setRuntimeConfigSyncer (fn: (() => void) | null): void {
    this.runtimeConfigSyncer = fn;
  }

  runRuntimeConfigSyncer (): void {
    try {
      this.runtimeConfigSyncer?.();
    } catch (e) {
      this.log('error', `运行时配置同步失败: ${String(e)}`);
    }
  }

  private startWebMonitor (): void {
    if (this.webMonitorInterval) return;

    this.webMonitorInterval = setInterval(() => {
      this.syncWebServer();
    }, 3000);
  }

  private syncWebServer (): void {
    const enabled = Boolean(this.config.webEnable);
    const port = Number(this.config.webPort || 14514);
    const host = String(this.config.webHost || DEFAULT_PLUGIN_CONFIG.webHost || '127.0.0.1').trim() || '127.0.0.1';
    const token = String(this.config.webToken || '').trim();
    const signature = enabled ? `${host}:${port}:${token}` : 'disabled';

    if (signature === this.lastWebSignature) return;

    this.lastWebSignature = signature;
    this.log('info', `Web配置同步: enabled=${String(enabled)}, host=${host}, port=${String(port)}, token=${token ? '***' : '(empty)'}`);

    if (!enabled) {
      stopWebServer();
      return;
    }

    if (!token || token.toLowerCase() === 'changeme') {
      stopWebServer();
      this.log('error', 'Web 面板已启用，但 webToken 为空或仍为 changeme，已拒绝启动；请先设置强随机 Token');
      return;
    }

    startWebServer({
      port,
      host,
      token,
      getConfig: () => this.getWebConfigSnapshot(),
      setConfig: patch => this.setWebConfigPatch(patch),
      log: (level, msg) => this.log(level, msg),
    });
  }

  setVerificationCleanupInterval (interval: ReturnType<typeof setInterval>): void {
    this.startWebMonitor();
    if (this.cleanupInterval && this.cleanupInterval !== interval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = interval;
    this.syncWebServer();
  }

  clearVerificationCleanupInterval (): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.webMonitorInterval) {
      clearInterval(this.webMonitorInterval);
      this.webMonitorInterval = null;
    }

    stopWebServer();
    this.lastWebSignature = '';
  }

  log (level: 'info' | 'warn' | 'error', msg: string, ...args: unknown[]): void {
    this.logger?.[level](`[AI Cat] ${msg}`, ...args);
  }

  debug (msg: string, ...args: unknown[]): void {
    if (this.config.debug) this.logger?.info(`[AI Cat] [DEBUG] ${msg}`, ...args);
  }

  isGroupAIDisabled (groupId: string): boolean {
    return (this.config.disabledGroups || []).includes(groupId);
  }

  setGroupAI (groupId: string, enabled: boolean): void {
    if (!this.config.disabledGroups) this.config.disabledGroups = [];

    const idx = this.config.disabledGroups.indexOf(groupId);

    if (enabled && idx !== -1) {
      this.config.disabledGroups.splice(idx, 1);
    } else if (!enabled && idx === -1) {
      this.config.disabledGroups.push(groupId);
    }

    this.saveConfig();
  }

  getWebConfigSnapshot (): PluginConfig {
    return {
      ...mergeModelCachesIntoConfig(this.config),
      [WEB_CONFIG_REVISION_KEY]: this.configRevision,
    } as PluginConfig;
  }

  setWebConfigPatch (patch: Record<string, unknown>): PluginConfig {
    const incomingRevision = getIncomingConfigRevision(patch);

    if (incomingRevision === null && touchesRevisionGuardedConfig(patch)) {
      throw createConfigConflictError(null, this.configRevision);
    }

    if (incomingRevision !== null && incomingRevision !== this.configRevision) {
      throw createConfigConflictError(incomingRevision, this.configRevision);
    }

    const base = stripRuntimeConfigMeta(this.config as unknown as Record<string, unknown>);
    const cleanPatch = stripRuntimeConfigMeta(patch);

    this.config = normalizePluginConfig({
      ...base,
      ...cleanPatch,
    });

    this.saveConfig();
    return this.getWebConfigSnapshot();
  }

  saveConfig (): void {
    this.runRuntimeConfigSyncer();

    if (!this.configPath) {
      this.log('warn', 'configPath 为空，无法保存 NapCat 配置');
      return;
    }

    try {
      const resolved = path.resolve(this.configPath);
      const dir = path.dirname(resolved);

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      /**
       * 关键：
       * 1. 如果运行时临时带了 models_cache，先写入独立 JSON
       * 2. 主配置保存前剥离 models_cache，只保留 models_cache_path
       */
      const configForSave = stripRuntimeConfigMeta(this.config as unknown as Record<string, unknown>) as unknown as PluginConfig;

      extractAndPersistModelCaches(configForSave);

      const stripped = stripModelCachesFromConfig(configForSave);

      fs.writeFileSync(resolved, JSON.stringify(stripped, null, 2), 'utf-8');

      /**
       * 保证运行时也不持有大 models_cache
       */
      this.config = stripped as PluginConfig;
      this.configRevision++;
    } catch (e) {
      this.log('error', `保存配置失败: ${String(e)}`);
    }

    this.syncWebServer();
  }
}

export const pluginState = new PluginState();
