import { ProxyAgent } from 'undici';

type FetchInitWithDispatcher = RequestInit & {
  dispatcher?: ProxyAgent;
};

const proxyAgents = new Map<string, ProxyAgent>();

export function normalizeProxyUrl (value: unknown): string | undefined {
  const text = String(value || '').trim();
  return text || undefined;
}

function getSupportedProxyUrl (proxy: string): string {
  let url: URL;

  try {
    url = new URL(proxy);
  } catch {
    throw new Error('代理地址无效，请使用 http:// 或 https:// 代理地址');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`暂不支持 ${url.protocol.replace(':', '') || '未知'} 代理，仅支持 http:// 和 https://`);
  }

  return url.toString();
}

function getProxyAgent (proxy: string): ProxyAgent {
  const key = getSupportedProxyUrl(proxy);
  const existing = proxyAgents.get(key);
  if (existing) return existing;

  const agent = new ProxyAgent(key);
  proxyAgents.set(key, agent);
  return agent;
}

export async function fetchWithProxy (
  url: string,
  init: RequestInit = {},
  proxy?: string
): Promise<Response> {
  const normalizedProxy = normalizeProxyUrl(proxy);

  if (!normalizedProxy) {
    return await fetch(url, init);
  }

  return await fetch(url, {
    ...init,
    dispatcher: getProxyAgent(normalizedProxy),
  } as FetchInitWithDispatcher);
}
