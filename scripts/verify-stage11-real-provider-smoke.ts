import fs from 'node:fs';
import path from 'node:path';
import type { ImageGenerateRequest, ImageModelTarget, ImageProviderType } from '../src/types';
import { generateImageWithFallback } from '../src/image/generator';

const OUT_DIR = path.resolve('tmp/stage11-real-provider-smoke');
const CONFIG_ENV = 'AICAT_REAL_IMAGE_SMOKE_CONFIG';
const TARGETS_ENV = 'AICAT_REAL_IMAGE_TARGETS_JSON';

type SmokeTarget = Partial<ImageModelTarget> & {
  base_url?: string;
  api_key?: string;
  provider_type?: ImageProviderType;
  provider?: ImageProviderType;
};

interface SmokeConfig {
  targets: SmokeTarget[];
  prompt?: string;
  aspect_ratio?: string;
  resolution?: string;
  referenceImagePath?: string;
}

interface ReferenceImage {
  data: Uint8Array;
  mime_type: string;
}

const PROVIDERS = new Set<ImageProviderType>([
  'openai',
  'gemini',
  'gemini_openai',
  'z_image_gitee',
  'jimeng2api',
  'grok',
]);

function assert (condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseJsonEnv (name: string): unknown {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} 不是合法 JSON：${String(error)}`);
  }
}

function loadSmokeConfig (): SmokeConfig | null {
  const configValue = parseJsonEnv(CONFIG_ENV);
  if (configValue) {
    if (Array.isArray(configValue)) return { targets: configValue as SmokeTarget[] };
    if (typeof configValue === 'object') {
      const cfg = configValue as Partial<SmokeConfig>;
      return {
        targets: Array.isArray(cfg.targets) ? cfg.targets : [],
        prompt: cfg.prompt,
        aspect_ratio: cfg.aspect_ratio,
        resolution: cfg.resolution,
        referenceImagePath: cfg.referenceImagePath,
      };
    }
    throw new Error(`${CONFIG_ENV} 必须是对象或数组`);
  }

  const targetsValue = parseJsonEnv(TARGETS_ENV);
  if (!targetsValue) return null;
  if (!Array.isArray(targetsValue)) throw new Error(`${TARGETS_ENV} 必须是数组`);

  return {
    targets: targetsValue as SmokeTarget[],
    prompt: process.env.AICAT_REAL_IMAGE_PROMPT,
    aspect_ratio: process.env.AICAT_REAL_IMAGE_ASPECT_RATIO,
    resolution: process.env.AICAT_REAL_IMAGE_RESOLUTION,
    referenceImagePath: process.env.AICAT_REAL_IMAGE_REFERENCE_PATH,
  };
}

function toProviderType (target: SmokeTarget): ImageProviderType {
  const provider = target.providerType || target.provider_type || target.provider;
  assert(provider && PROVIDERS.has(provider), `providerType 不合法：${String(provider || '')}`);
  return provider;
}

function normalizeTarget (raw: SmokeTarget, index: number): ImageModelTarget {
  const providerType = toProviderType(raw);
  const model = String(raw.model || '').trim();
  const baseUrl = String(raw.baseUrl || raw.base_url || '').trim();
  const apiKey = String(raw.apiKey || raw.api_key || '').trim();
  const channelName = String(raw.channelName || `real-${providerType}-${index + 1}`).trim();
  const timeoutRaw = Number(raw.timeout || 180000);
  const timeout = Number.isFinite(timeoutRaw) && timeoutRaw > 0
    ? Math.min(900000, Math.max(10000, Math.floor(timeoutRaw)))
    : 180000;

  assert(model, `${channelName}: 缺少 model`);
  assert(baseUrl, `${channelName}: 缺少 baseUrl`);
  assert(apiKey, `${channelName}: 缺少 apiKey`);

  return {
    channelName,
    model,
    providerType,
    baseUrl,
    apiKey,
    timeout,
    proxy: typeof raw.proxy === 'string' && raw.proxy.trim() ? raw.proxy.trim() : undefined,
    capability_options: raw.capability_options,
    extra: raw.extra,
  };
}

function detectMimeByBytes (data: Uint8Array, filePath = ''): string {
  const b = data;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function extensionForMime (mime: string): string {
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

function loadReferenceImage (filePath?: string): ReferenceImage[] {
  const value = String(filePath || '').trim();
  if (!value) return [];

  const fullPath = path.resolve(value);
  const data = new Uint8Array(fs.readFileSync(fullPath));
  assert(data.byteLength > 0, `参考图为空：${fullPath}`);

  return [{
    data,
    mime_type: detectMimeByBytes(data, fullPath),
  }];
}

function redact (text: string, targets: ImageModelTarget[]): string {
  let result = text;

  for (const target of targets) {
    if (target.apiKey) {
      result = result.split(target.apiKey).join('[REDACTED_API_KEY]');
    }
  }

  return result;
}

function buildRequest (config: SmokeConfig): ImageGenerateRequest {
  const prompt = String(
    process.env.AICAT_REAL_IMAGE_PROMPT ||
    config.prompt ||
    '一只白猫坐在窗边，真实摄影风格，画面干净'
  ).trim();

  return {
    prompt,
    aspect_ratio: String(process.env.AICAT_REAL_IMAGE_ASPECT_RATIO || config.aspect_ratio || '1:1').trim(),
    resolution: String(process.env.AICAT_REAL_IMAGE_RESOLUTION || config.resolution || '1K').trim(),
    images: loadReferenceImage(process.env.AICAT_REAL_IMAGE_REFERENCE_PATH || config.referenceImagePath),
    task_id: `stage11-real-provider-${Date.now()}`,
  };
}

function writeOutputImages (
  target: ImageModelTarget,
  images: Uint8Array[],
): string[] {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  return images.map((data, index) => {
    const mime = detectMimeByBytes(data);
    const ext = extensionForMime(mime);
    const safeName = `${target.channelName}-${target.model}`
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80);
    const file = path.join(OUT_DIR, `${safeName}-${index + 1}.${ext}`);
    fs.writeFileSync(file, Buffer.from(data));
    return file;
  });
}

async function verifyTarget (
  target: ImageModelTarget,
  req: ImageGenerateRequest,
  allTargets: ImageModelTarget[],
): Promise<void> {
  const label = `${target.channelName}/${target.model}`;
  const result = await generateImageWithFallback([target], req);

  if (result.error) {
    throw new Error(`${label} 真实 Provider smoke 失败：${redact(result.error, allTargets)}`);
  }

  assert(result.images?.length, `${label} 未返回图片`);
  for (const image of result.images || []) {
    assert(image.byteLength > 0, `${label} 返回空图片`);
  }

  const files = writeOutputImages(target, result.images || []);
  console.log(`ok - ${label} 真实 Provider 生图成功，输出 ${files.length} 张到 ${OUT_DIR}`);
}

async function main (): Promise<void> {
  const config = loadSmokeConfig();

  if (!config) {
    console.log(`skip - 未设置 ${CONFIG_ENV} 或 ${TARGETS_ENV}，跳过真实 Provider smoke`);
    return;
  }

  assert(Array.isArray(config.targets) && config.targets.length > 0, '真实 Provider smoke 缺少 targets');

  const targets = config.targets.map(normalizeTarget);
  const req = buildRequest(config);

  console.log(`stage11 real provider smoke targets: ${targets.map(t => `${t.channelName}/${t.model}`).join(', ')}`);

  for (const target of targets) {
    await verifyTarget(target, req, targets);
  }

  console.log('stage11 real provider smoke verification passed');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
