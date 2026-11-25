// JSON-RPC 2.0 over MCP Streamable HTTP, ported from `src/mcp.rs`.
//
// Stateless by design: no Mcp-Session-Id is issued, so a client can call
// POST /mcp from any cold start. A notification (a message without `id`) is
// answered with 202 and an empty body, as the transport requires.

import {
  DISCLOSURE,
  INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
  ToolError,
  invoke,
  toolsList,
} from './knowledge.js';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const LATEST_PROTOCOL_VERSION = '2025-06-18';

function successResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } };
}

function initializeResult(params) {
  const requested = params && typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
  const version = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
  return {
    protocolVersion: version,
    capabilities: {
      tools: { listChanged: false },
      resources: {},
      prompts: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      title: 'Amway Korea knowledge (unofficial, ABO-published)',
      version: SERVER_VERSION,
    },
    instructions: INSTRUCTIONS,
  };
}

function toolCall(params) {
  const name = params && typeof params.name === 'string' ? params.name : null;
  if (name === null) {
    return {
      response: errorResponse(params && params.id, -32602, "Invalid params: 'name' is required"),
      meta: null,
    };
  }
  const args = params.arguments === undefined ? null : params.arguments;
  const meta = { tool: name, arg: argumentLabel(name, args) };
  try {
    const outcome = invoke(name, args);
    return {
      response: successResponse(params.id, {
        content: [{ type: 'text', text: outcome.text }],
        structuredContent: {
          request: outcome.request,
          data: outcome.data,
          disclosure: DISCLOSURE,
        },
        isError: false,
      }),
      meta,
    };
  } catch (error) {
    const message = error instanceof ToolError ? error.message : String((error && error.message) || error);
    return {
      response: successResponse(params.id, {
        content: [{ type: 'text', text: message }],
        isError: true,
      }),
      meta,
    };
  }
}

const ARG_FIELDS = {
  get_amway_facts: 'category',
  explain_monetization: 'goal_type',
  compare_concerns: 'topic',
  get_join_guide: 'member_type',
};

/** `category=health_nutrition` — the single enum argument that identifies the answer. */
export function argumentLabel(tool, args) {
  const field = ARG_FIELDS[tool];
  if (!field) return '';
  const value = args && typeof args === 'object' ? args[field] : undefined;
  if (typeof value !== 'string' || value.trim() === '') return '';
  return `${field}=${value.trim().toLowerCase().replace(/[ -]/g, '_')}`;
}

/**
 * Handles one JSON-RPC message.
 * Returns { response, meta } where response is null for a notification.
 */
export function handleMessage(message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return {
      response: errorResponse(null, -32600, 'Invalid Request: expected a JSON object'),
      meta: null,
    };
  }
  const method = typeof message.method === 'string' ? message.method : null;
  const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
  if (method === null) {
    if (hasId) {
      return {
        response: errorResponse(message.id, -32600, 'Invalid Request: missing method'),
        meta: null,
      };
    }
    return { response: null, meta: null };
  }

  // A notification has no id and must never be answered.
  if (!hasId) return { response: null, meta: null };

  const id = message.id;
  const params = message.params === undefined || message.params === null ? {} : message.params;

  switch (method) {
    case 'initialize':
      return { response: successResponse(id, initializeResult(params)), meta: null };
    case 'notifications/initialized':
    case 'initialized':
      return { response: null, meta: null };
    case 'ping':
      return { response: successResponse(id, {}), meta: { tool: 'ping', arg: '' } };
    case 'tools/list':
      return {
        response: successResponse(id, { tools: toolsList() }),
        meta: { tool: 'tools/list', arg: '' },
      };
    case 'tools/call': {
      const call = toolCall({ ...params, id });
      return { response: call.response, meta: call.meta };
    }
    case 'resources/list':
      return { response: successResponse(id, { resources: [] }), meta: null };
    case 'prompts/list':
      return { response: successResponse(id, { prompts: [] }), meta: null };
    case 'logging/setLevel':
      return { response: successResponse(id, {}), meta: null };
    default:
      return {
        response: errorResponse(id, -32601, `Method not found: ${method}`),
        meta: null,
      };
  }
}

/**
 * Handles a POST body. Returns:
 *   { status, body }  body is a JSON-RPC response object/array, or null
 *   { meta }          the tool call worth logging (last one in a batch)
 */
export function handleBody(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: 200,
      body: errorResponse(null, -32700, `Parse error: ${error.message}`),
      meta: null,
    };
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { status: 200, body: errorResponse(null, -32600, 'Invalid Request: empty batch'), meta: null };
    }
    const responses = [];
    let meta = null;
    for (const item of parsed) {
      const handled = handleMessage(item);
      if (handled.response) responses.push(handled.response);
      if (handled.meta) meta = handled.meta;
    }
    if (responses.length === 0) return { status: 202, body: null, meta };
    return { status: 200, body: responses, meta };
  }

  const handled = handleMessage(parsed);
  if (!handled.response) return { status: 202, body: null, meta: handled.meta };
  return { status: 200, body: handled.response, meta: handled.meta };
}
