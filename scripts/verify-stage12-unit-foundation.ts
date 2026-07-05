import { DEFAULT_PLUGIN_CONFIG } from '../src/config';
import { normalizePluginConfig } from '../src/core/config-normalizer';
import { pluginState } from '../src/core/state';
import {
  aspectRatioToOpenAISize,
  normalizeImageBaseUrl,
} from '../src/image/utils';
import {
  filterToolsForUser,
  validateApiToolPermission,
  validateMessageToolResultScope,
  validateMessageToolScope,
} from '../src/tools/ai-permissions';
import type { Tool, ToolResult } from '../src/types';
import {
  checkMessageSafety,
  detectUserInputDanger,
  getSafetyBlockMessage,
  sanitizeReplyText,
  sanitizeUserInput,
} from '../src/utils/message-safety';
import { normalizeProxyUrl } from '../src/utils/proxy-fetch';

type TestFn = () => Promise<void> | void;

interface TestCase {
  name: string;
  fn: TestFn;
}

const tests: TestCase[] = [];

function assert (condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T> (actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function deepEqual (actual: unknown, expected: unknown, message: string): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);

  if (actualText !== expectedText) {
    throw new Error(`${message}: expected ${expectedText}, got ${actualText}`);
  }
}

function test (name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function tool (name: string): Tool {
  return {
    type: 'function',
    function: {
      name,
      description: `${name} test tool`,
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  };
}

test('config normalizer parses loose lists and preserves model priority slashes', () => {
  const config = normalizePluginConfig({
    ownerQQs: '10001，10002  10003',
    whitelistQQs: '["20001","20002"]',
    disabledGroups: '[30001, 30002]',
    enabledChatModelPriority: 'chat-a/model-a, chat-b/model-b',
    enabledImageModelPriority: ['img-a/model-a', 'img-a/model-a', 'img-b/model-b'],
  });

  equal(config.ownerQQs, '10001,10002,10003', 'ownerQQs should normalize Chinese comma and spaces');
  deepEqual(config.whitelistQQs, ['20001', '20002'], 'whitelistQQs should parse JSON array string');
  deepEqual(config.disabledGroups, ['30001', '30002'], 'disabledGroups should parse bracket list');
  deepEqual(
    config.enabledChatModelPriority,
    ['chat-a/model-a', 'chat-b/model-b'],
    'chat model priority should not split channel/model slash'
  );
  deepEqual(
    config.enabledImageModelPriority,
    ['img-a/model-a', 'img-b/model-b'],
    'image model priority should dedupe and preserve slash'
  );
});

test('config normalizer clamps ports, image timeout and channel fields', () => {
  const config = normalizePluginConfig({
    webPort: '99999',
    imageGlobalTimeoutMs: 1,
    chatChannels: JSON.stringify([{
      name: ' chat ',
      base_url: 'https://chat.example/v1/chat/completions',
      api_key: ' key ',
      models_cache: ['must-not-survive'],
      models_cache_path: 'model-cache/chat/chat.json',
      enabled_models: [
        { id: ' model-a ', enabled: false },
        { id: '   ', enabled: true },
      ],
      timeout: '45000',
    }]),
    imageChannels: [{
      name: 'img',
      base_url: 'https://img.example/v1/images/generations',
      api_key: ' image-key ',
      provider_type: 'grok',
      models_cache: ['must-not-survive'],
      models_cache_path: 'model-cache/image/img.json',
      enabled_models: [{ id: 'image-a', enabled: true }],
      proxy: ' http://127.0.0.1:7890 ',
      timeout: '60000',
    }],
  });

  equal(config.webPort, DEFAULT_PLUGIN_CONFIG.webPort, 'invalid webPort should fall back');
  equal(config.imageGlobalTimeoutMs, 10000, 'image global timeout should clamp to minimum');
  equal(config.chatChannels[0]?.base_url, 'https://chat.example', 'chat base_url should strip OpenAI endpoint');
  equal(config.chatChannels[0]?.api_key, 'key', 'chat api_key should trim');
  deepEqual(config.chatChannels[0]?.models_cache, [], 'chat models_cache should be removed from runtime config');
  equal(config.chatChannels[0]?.models_cache_path, 'model-cache/chat/chat.json', 'chat cache path should survive');
  deepEqual(config.chatChannels[0]?.enabled_models, [{ id: 'model-a', enabled: false }], 'chat enabled models should normalize');
  equal(config.imageChannels[0]?.base_url, 'https://img.example', 'image base_url should strip generation endpoint');
  equal(config.imageChannels[0]?.api_key, 'image-key', 'image api_key should trim');
  equal(config.imageChannels[0]?.provider_type, 'grok', 'image provider_type should survive');
  equal(config.imageChannels[0]?.proxy, 'http://127.0.0.1:7890', 'image proxy should trim');
  deepEqual(config.imageChannels[0]?.models_cache, [], 'image models_cache should be removed from runtime config');
});

test('message safety filters dangerous CQ and OneBot media but keeps safe segments', () => {
  equal(detectUserInputDanger('发图 [CQ:image,file=a.png]'), 'image', 'image CQ should be detected');
  equal(detectUserInputDanger('提醒 [CQ:at,qq=10001]'), null, 'at CQ should be allowed');

  equal(
    sanitizeUserInput('x [CQ:image,file=a.png] y [CQ:at,qq=10001]'),
    'x [已过滤的图片] y [CQ:at,qq=10001]',
    'sanitizeUserInput should replace dangerous CQ and keep at'
  );
  equal(
    sanitizeUserInput('x {"type":"video","data":{"file":"a.mp4"}} y'),
    'x [已过滤的视频] y',
    'sanitizeUserInput should replace dangerous OneBot media segment'
  );
  equal(
    sanitizeReplyText('AI 输出 [CQ:record,file=a.amr]'),
    'AI 输出 [语音已过滤]',
    'sanitizeReplyText should filter dangerous CQ'
  );
  assert(getSafetyBlockMessage('image').includes('图片'), 'block message should include media label');
});

test('message safety blocks send APIs and nested forward media', () => {
  equal(
    checkMessageSafety('send_group_msg', {
      message: [{ type: 'text', data: { text: 'ok' } }],
    }),
    null,
    'safe message segment should pass'
  );
  equal(
    checkMessageSafety('send_group_msg', {
      message: [{ type: 'image', data: { file: 'a.png' } }],
    }),
    'image',
    'image segment should be blocked'
  );
  equal(
    checkMessageSafety('send_private_msg', {
      message: '[CQ:video,file=a.mp4]',
    }),
    'video',
    'video CQ in send message should be blocked'
  );
  equal(
    checkMessageSafety('send_group_forward_msg', {
      messages: [{
        type: 'node',
        data: {
          content: [{
            type: 'node',
            data: {
              content: [{ type: 'record', data: { file: 'a.amr' } }],
            },
          }],
        },
      }],
    }),
    'record',
    'nested forward media should be blocked'
  );
  equal(
    checkMessageSafety('get_group_info', { message: '[CQ:image,file=a.png]' }),
    null,
    'non-send APIs should not be blocked by message safety'
  );
});

test('ai permission helpers constrain non-owner API and message scopes', () => {
  const params: Record<string, unknown> = {};
  equal(
    validateApiToolPermission('send_group_msg', params, {
      currentGroupId: '100',
      isOwnerUser: false,
      isAdmin: false,
      userId: '200',
    }),
    null,
    'same-group send_group_msg should be allowed'
  );
  equal(params.group_id, '100', 'send_group_msg should fill current group_id');

  const cross = validateApiToolPermission('send_group_msg', { group_id: '101' }, {
    currentGroupId: '100',
    isOwnerUser: false,
    isAdmin: false,
    userId: '200',
  });
  assert(cross?.error?.includes('不能跨群'), 'cross-group operation should be blocked');

  const privateParams: Record<string, unknown> = {};
  equal(
    validateApiToolPermission('send_private_msg', privateParams, {
      isOwnerUser: false,
      isAdmin: false,
      userId: '200',
    }),
    null,
    'self private send should be allowed'
  );
  equal(privateParams.user_id, '200', 'send_private_msg should fill current user_id');

  const ownerOnly = validateApiToolPermission('get_credentials', {}, {
    currentGroupId: '100',
    isOwnerUser: false,
    isAdmin: true,
    userId: '200',
  });
  assert(ownerOnly?.error?.includes('主人'), 'owner-only API should be blocked for non-owner');

  const adminOnly = validateApiToolPermission('set_group_ban', { group_id: '100' }, {
    currentGroupId: '100',
    isOwnerUser: false,
    isAdmin: false,
    userId: '200',
  });
  assert(adminOnly?.error?.includes('管理员'), 'admin API should be blocked for non-admin');
});

test('message tool scope helpers fill current group and reject out-of-scope results', () => {
  const args: Record<string, unknown> = {};
  equal(validateMessageToolScope('search_messages', args, '100', false), null, 'current group query should be allowed');
  equal(args.group_id, '100', 'message query should fill current group_id');

  const cross = validateMessageToolScope('search_messages', { group_id: '101' }, '100', false);
  assert(cross?.error?.includes('当前群'), 'cross-group message query should be blocked');

  const privateQuery = validateMessageToolScope('search_messages', {}, undefined, false);
  assert(privateQuery?.error?.includes('私聊'), 'private global message query should be blocked');

  const result: ToolResult = { success: true, data: { group_id: '101' } };
  const scoped = validateMessageToolResultScope('get_message_by_id', result, '100', false);
  assert(scoped?.error?.includes('当前群'), 'out-of-scope get_message_by_id result should be blocked');
  equal(validateMessageToolResultScope('get_message_by_id', { success: true, data: { group_id: '100' } }, '100', false), null, 'same group result should pass');
});

test('tool filtering removes owner-only tools for non-owner users', () => {
  const tools = [
    tool('query_error_logs'),
    tool('list_custom_commands'),
    tool('send_message'),
  ];

  deepEqual(
    filterToolsForUser(tools, false).map(item => item.function.name),
    ['send_message'],
    'non-owner tool list should remove owner-only tools'
  );
  deepEqual(
    filterToolsForUser(tools, true).map(item => item.function.name),
    ['query_error_logs', 'list_custom_commands', 'send_message'],
    'owner tool list should keep all tools'
  );
});

test('image and proxy utility helpers normalize stable values', () => {
  equal(normalizeImageBaseUrl('https://img.example/v1/images/edits'), 'https://img.example', 'image edit endpoint should strip');
  equal(normalizeImageBaseUrl('https://img.example/v1/images/generations'), 'https://img.example', 'image generation endpoint should strip');
  equal(normalizeImageBaseUrl('https://img.example/v1'), 'https://img.example', 'v1 suffix should strip');
  equal(aspectRatioToOpenAISize('自动'), '1024x1024', 'auto aspect should use square size');
  equal(aspectRatioToOpenAISize('16:9'), '1792x1024', 'wide aspect should map to landscape size');
  equal(aspectRatioToOpenAISize('9:16'), '1024x1792', 'vertical aspect should map to portrait size');
  equal(normalizeProxyUrl(' http://127.0.0.1:7890 '), 'http://127.0.0.1:7890', 'proxy should trim');
  equal(normalizeProxyUrl('   '), undefined, 'empty proxy should become undefined');
});

async function main (): Promise<void> {
  let passed = 0;

  try {
    for (const item of tests) {
      await item.fn();
      passed++;
      console.log(`ok - ${item.name}`);
    }

    console.log(`stage12 unit foundation verification passed (${passed} tests)`);
  } finally {
    pluginState.clearVerificationCleanupInterval();
  }
}

main().catch(error => {
  pluginState.clearVerificationCleanupInterval();
  console.error(error);
  process.exit(1);
});
