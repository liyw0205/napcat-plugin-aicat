import type { Tool, ToolResult } from '../types';
import {
  ADMIN_REQUIRED_APIS,
  OWNER_ONLY_APIS,
  OWNER_ONLY_CUSTOM_TOOLS,
  OWNER_ONLY_TOOLS,
} from '../config';

export interface ApiPermissionContext {
  currentGroupId?: string;
  isOwnerUser: boolean;
  isAdmin: boolean;
  userId: string;
}

const SEND_GROUP_APIS = new Set([
  'send_group_msg',
  'send_group_forward_msg',
]);

const SEND_PRIVATE_APIS = new Set([
  'send_private_msg',
  'send_private_forward_msg',
]);

const SEND_ANY_APIS = new Set([
  'send_msg',
]);

function normalizeId (value: unknown): string {
  const text = String(value ?? '').trim();
  return text;
}

function getToolName (tool: Tool): string {
  return tool.function.name;
}

export function filterToolsForUser (tools: Tool[], isOwnerUser: boolean): Tool[] {
  if (isOwnerUser) return tools;

  return tools.filter(tool => {
    const name = getToolName(tool);
    return !OWNER_ONLY_TOOLS.has(name) && !OWNER_ONLY_CUSTOM_TOOLS.has(name);
  });
}

export function validateApiToolPermission (
  action: string,
  params: Record<string, unknown>,
  context: ApiPermissionContext
): ToolResult | null {
  if (!action) return { success: false, error: '缺少 action 参数' };
  if (context.isOwnerUser) return null;

  if (OWNER_ONLY_APIS.has(action)) {
    return { success: false, error: '该信息仅主人可查询喵～' };
  }

  if (ADMIN_REQUIRED_APIS.has(action) && !context.isAdmin) {
    return { success: false, error: '你不是管理员喵～' };
  }

  const groupId = normalizeId(params.group_id);
  if (groupId) {
    if (!context.currentGroupId) {
      return { success: false, error: '私聊中不能操作群聊喵～' };
    }

    if (groupId !== context.currentGroupId) {
      return { success: false, error: '不能跨群操作喵～' };
    }
  }

  if (SEND_GROUP_APIS.has(action)) {
    if (!context.currentGroupId) {
      return { success: false, error: '私聊中不能发送群消息喵～' };
    }

    if (!groupId) params.group_id = context.currentGroupId;
  }

  if (SEND_PRIVATE_APIS.has(action)) {
    const targetUserId = normalizeId(params.user_id);

    if (targetUserId && targetUserId !== context.userId) {
      return { success: false, error: '普通用户不能让机器人私聊其他人喵～' };
    }

    if (!targetUserId) params.user_id = context.userId;
  }

  if (SEND_ANY_APIS.has(action)) {
    const targetGroupId = normalizeId(params.group_id);
    const targetUserId = normalizeId(params.user_id);

    if (targetGroupId) {
      if (!context.currentGroupId || targetGroupId !== context.currentGroupId) {
        return { success: false, error: '不能跨群操作喵～' };
      }
    } else if (targetUserId) {
      if (targetUserId !== context.userId) {
        return { success: false, error: '普通用户不能让机器人私聊其他人喵～' };
      }
    } else if (context.currentGroupId) {
      params.group_id = context.currentGroupId;
    } else {
      params.user_id = context.userId;
    }
  }

  return null;
}

export function validateMessageToolScope (
  name: string,
  args: Record<string, unknown>,
  currentGroupId?: string,
  isOwnerUser?: boolean
): ToolResult | null {
  const queryGroupId = normalizeId(args.group_id);

  if (isOwnerUser) return null;

  if (!currentGroupId) {
    return { success: false, error: '私聊中不能查询全局消息记录喵～' };
  }

  if (queryGroupId && queryGroupId !== currentGroupId) {
    return { success: false, error: '只能查询当前群的消息记录喵～' };
  }

  if (!queryGroupId) {
    args.group_id = currentGroupId;
  }

  return null;
}

export function validateMessageToolResultScope (
  name: string,
  result: ToolResult,
  currentGroupId?: string,
  isOwnerUser?: boolean
): ToolResult | null {
  if (isOwnerUser || name !== 'get_message_by_id' || !result.success) return null;

  const data = (result.data || {}) as { group_id?: unknown; };
  const messageGroupId = normalizeId(data.group_id);

  if (!currentGroupId || !messageGroupId || messageGroupId !== currentGroupId) {
    return { success: false, error: '只能查询当前群的消息记录喵～' };
  }

  return null;
}
