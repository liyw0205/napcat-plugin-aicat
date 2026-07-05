declare module 'napcat-types/napcat-onebot/action/index' {
  export interface ActionMap {
    call: (actionName: string, params: unknown, adapter: string, config: unknown) => Promise<unknown>;
    get: (actionName: string) => unknown;
  }
}

declare module 'napcat-types/napcat-onebot/config/config' {
  export type NetworkAdapterConfig = unknown;
}

declare module 'napcat-types/napcat-onebot/types/index' {
  export interface OB11Message {
    post_type?: string;
    message_type: 'group' | 'private' | string;
    message_id?: number | string;
    group_id?: number | string;
    user_id?: number | string;
    self_id?: number | string;
    raw_message?: string;
    message?: unknown;
    sender?: {
      user_id?: number | string;
      nickname?: string;
      card?: string;
      role?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  export interface OB11PostSendMsg {
    message: unknown;
    message_type: string;
    group_id?: string;
    user_id?: string;
  }
}

declare module 'napcat-types/napcat-onebot/network/plugin-manger' {
  import type { ActionMap } from 'napcat-types/napcat-onebot/action/index';

  export interface PluginLogger {
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  }

  export type PluginConfigSchema = unknown;

  export interface NapCatConfigBuilder {
    text: (key: string, name: string, defaultValue: string, description?: string) => PluginConfigSchema;
    boolean: (key: string, name: string, defaultValue: boolean, description?: string) => PluginConfigSchema;
    combine: (...items: PluginConfigSchema[]) => PluginConfigSchema;
  }

  export interface NapCatPluginContext {
    actions: ActionMap;
    adapterName: string;
    configPath?: string;
    logger?: PluginLogger;
    NapCatConfig: NapCatConfigBuilder;
    pluginManager: {
      config: unknown;
    };
  }

  export interface PluginModule {
    plugin_init?: (ctx: NapCatPluginContext) => Promise<void> | void;
    plugin_onmessage?: (ctx: NapCatPluginContext, event: import('napcat-types/napcat-onebot/types/index').OB11Message) => Promise<void> | void;
    plugin_onevent?: (ctx: NapCatPluginContext, event: unknown) => Promise<void> | void;
    plugin_cleanup?: () => Promise<void> | void;
  }
}
