// Test helpers: an in-memory KV, a fake execution context, and a request runner
// for the Worker's `fetch` handler. No wrangler/workerd needed, so `node --test`
// runs anywhere.

import worker from '../src/index.js';

export class MemoryKV {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.reads = 0;
    this.writes = 0;
  }

  async get(key, options) {
    this.reads += 1;
    const value = this.map.get(key);
    if (value === undefined) return null;
    const type = typeof options === 'string' ? options : options && options.type;
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.writes += 1;
    this.map.set(key, String(value));
  }

  async delete(key) {
    this.map.delete(key);
  }

  raw(key) {
    return this.map.get(key);
  }
}

export function makeEnv(extra = {}) {
  return { STATS: new MemoryKV(), ...extra };
}

export function makeCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    },
    passThroughOnException() {},
    async flush() {
      while (pending.length) {
        await pending.shift();
      }
    },
  };
}

export function request(path, init = {}) {
  return new Request(`https://amway-agent-mcp.test${path}`, init);
}

export async function call(env, path, init = {}) {
  const ctx = makeCtx();
  const response = await worker.fetch(request(path, init), env, ctx);
  const bodyText = await response.text();
  await ctx.flush();
  let body = null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json') && bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = null;
    }
  }
  return { response, status: response.status, headers: response.headers, text: bodyText, body };
}

export async function mcp(env, message, { userAgent = 'curl/8.0' } = {}) {
  return call(env, '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: typeof message === 'string' ? message : JSON.stringify(message),
  });
}

export async function stats(env) {
  return call(env, '/api/stats');
}
