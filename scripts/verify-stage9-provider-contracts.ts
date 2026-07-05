import http from 'node:http';
import type { ImageModelTarget } from '../src/types';
import { generateImageWithFallback } from '../src/image/generator';

interface CapturedRequest {
  method: string;
  url: string;
  body: unknown;
  headers: http.IncomingHttpHeaders;
}

interface ProviderServer {
  server: http.Server;
  requests: CapturedRequest[];
  imageHits: number;
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

async function readBody (req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function parseJsonBody (body: Buffer): unknown {
  if (!body.byteLength) return {};

  try {
    return JSON.parse(body.toString('utf-8'));
  } catch {
    return body.toString('utf-8');
  }
}

function createProviderServer (): ProviderServer {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
  ]);

  const state: ProviderServer = {
    requests: [],
    imageHits: 0,
    server: http.createServer(async (req, res) => {
      const body = await readBody(req);
      const parsed = parseJsonBody(body);

      state.requests.push({
        method: req.method || 'GET',
        url: req.url || '/',
        body: parsed,
        headers: req.headers,
      });

      if (req.method === 'GET' && req.url === '/stage9-image.png') {
        state.imageHits++;
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(png);
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        const payload = parsed as { model?: string; };
        const host = req.headers.host || '127.0.0.1';

        if (payload.model === 'gemini-openai-url') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            choices: [{
              message: {
                content: `![Generated Image](http://${host}/stage9-image.png "Generated Image")`,
              },
            }],
          }));
          return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{
            message: {
              content: `data:image/png;base64,${png.toString('base64')}`,
            },
          }],
        }));
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/images/generations') {
        const payload = parsed as { model?: string; };

        if (payload.model === 'stage9-fail-500') {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'stage9 transient failure' }));
          return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`not found: ${req.method || 'GET'} ${req.url || '/'}`);
    }),
  };

  return state;
}

function target (
  providerType: ImageModelTarget['providerType'],
  baseUrl: string,
  model: string,
  channelName = `stage9-${providerType}`,
): ImageModelTarget {
  return {
    channelName,
    model,
    providerType,
    baseUrl,
    apiKey: 'stage9-key',
    timeout: 10000,
  };
}

function requestsFor (requests: CapturedRequest[], url: string): CapturedRequest[] {
  return requests.filter(req => req.url === url);
}

async function verifyGeminiOpenAI (baseUrl: string, requests: CapturedRequest[], server: ProviderServer): Promise<void> {
  const reference = {
    data: new Uint8Array([1, 2, 3, 4]),
    mime_type: 'image/png',
  };

  const b64 = await generateImageWithFallback(
    [target('gemini_openai', baseUrl, 'gemini-openai-b64')],
    {
      prompt: 'stage9 gemini openai b64',
      images: [reference],
    }
  );

  assert(!b64.error, `gemini_openai b64 failed: ${b64.error}`);
  assert(b64.images?.[0]?.byteLength, 'gemini_openai should decode data:image response');
  assert(b64.usedModel === 'stage9-gemini_openai/gemini-openai-b64', 'gemini_openai should report used model');

  const body = requestsFor(requests, '/v1/chat/completions').at(-1)?.body as {
    model?: string;
    messages?: { content?: unknown[]; }[];
    modalities?: string[];
  };

  assert(body?.model === 'gemini-openai-b64', 'gemini_openai should send selected model');
  assert(Array.isArray(body?.modalities) && body.modalities.includes('image'), 'gemini_openai should request image modality');
  assert(
    Array.isArray(body?.messages?.[0]?.content) &&
      body.messages[0].content.some((part: { type?: string; image_url?: { url?: string; }; }) =>
        part.type === 'image_url' &&
        String(part.image_url?.url || '').startsWith('data:image/png;base64,')
      ),
    'gemini_openai should include reference images as data URLs'
  );

  const imageHitsBefore = server.imageHits;
  const url = await generateImageWithFallback(
    [target('gemini_openai', baseUrl, 'gemini-openai-url')],
    { prompt: 'stage9 gemini openai url' }
  );

  assert(!url.error, `gemini_openai url failed: ${url.error}`);
  assert(url.images?.[0]?.byteLength, 'gemini_openai should download markdown image url');
  assert(server.imageHits > imageHitsBefore, 'gemini_openai should fetch returned image url');
}

async function verifyB64Provider (
  providerType: ImageModelTarget['providerType'],
  baseUrl: string,
  model: string,
  expectedPayload: (body: Record<string, unknown>) => void
): Promise<void> {
  const result = await generateImageWithFallback(
    [target(providerType, baseUrl, model)],
    {
      prompt: `stage9 ${providerType}`,
      aspect_ratio: '16:9',
      resolution: '4K',
    }
  );

  assert(!result.error, `${providerType} failed: ${result.error}`);
  assert(result.images?.[0]?.byteLength, `${providerType} should decode b64_json image`);
  assert(result.usedModel === `stage9-${providerType}/${model}`, `${providerType} should report used model`);

  const server = (globalThis as unknown as { __stage9ProviderServer?: ProviderServer; }).__stage9ProviderServer;
  const body = requestsFor(server?.requests || [], '/v1/images/generations').at(-1)?.body as Record<string, unknown>;
  expectedPayload(body || {});
}

async function verifyFallback (baseUrl: string): Promise<void> {
  const result = await generateImageWithFallback(
    [
      target('jimeng2api', baseUrl, 'stage9-fail-500', 'stage9-failing-jimeng'),
      target('grok', baseUrl, 'stage9-fallback-grok', 'stage9-working-grok'),
    ],
    { prompt: 'stage9 fallback' }
  );

  assert(!result.error, `fallback should recover from 500: ${result.error}`);
  assert(result.usedModel === 'stage9-working-grok/stage9-fallback-grok', 'fallback should use second target after retryable error');
}

async function main (): Promise<void> {
  const provider = createProviderServer();
  const port = await listen(provider.server);
  const baseUrl = `http://127.0.0.1:${port}`;
  (globalThis as unknown as { __stage9ProviderServer?: ProviderServer; }).__stage9ProviderServer = provider;

  try {
    await verifyGeminiOpenAI(baseUrl, provider.requests, provider);
    console.log('ok - gemini_openai b64, markdown url and reference payload');

    await verifyB64Provider('grok', baseUrl, 'stage9-grok', body => {
      assert(body.model === 'stage9-grok', 'grok should send selected model');
      assert(body.aspect_ratio === '16:9', 'grok should forward aspect ratio');
      assert(body.resolution === '4k', 'grok should lowercase resolution');
      assert(body.response_format === 'b64_json', 'grok should request b64_json');
    });
    console.log('ok - grok b64_json contract');

    await verifyB64Provider('jimeng2api', baseUrl, 'stage9-jimeng', body => {
      assert(body.model === 'stage9-jimeng', 'jimeng should send selected model');
      assert(body.prompt === 'stage9 jimeng2api', 'jimeng should send prompt');
      assert(body.response_format === 'b64_json', 'jimeng should request b64_json');
    });
    console.log('ok - jimeng2api b64_json contract');

    await verifyB64Provider('z_image_gitee', baseUrl, 'stage9-z-image', body => {
      assert(body.model === 'stage9-z-image', 'z_image should send selected model');
      assert(body.prompt === 'stage9 z_image_gitee', 'z_image should send prompt');
      assert(body.size === '1024x1024', 'z_image should send default size');
      assert(body.num_inference_steps === 9, 'z_image should send inference steps');
    });
    console.log('ok - z_image_gitee b64_json contract');

    await verifyFallback(baseUrl);
    console.log('ok - provider fallback after retryable upstream error');

    console.log('stage9 provider contract verification passed');
  } finally {
    delete (globalThis as unknown as { __stage9ProviderServer?: ProviderServer; }).__stage9ProviderServer;
    await closeServer(provider.server);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
