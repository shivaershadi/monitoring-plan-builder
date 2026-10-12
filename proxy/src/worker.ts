/**
 * Cloudflare Worker: AI proxy for Outcome Monitoring Studio (and the ES prototype).
 *
 * - Holds the Anthropic key as a Worker secret (ANTHROPIC_API_KEY). The browser never sees it.
 * - Forwards POST /api/anthropic/v1/messages to api.anthropic.com.
 * - Counts tokens per UTC day in KV (USAGE) and refuses with 429 once DAILY_TOKEN_CAP is exceeded.
 * - Access control: Cloudflare Access in front of Pages+Worker (recommended), plus an optional shared
 *   header token (STUDIO_TOKEN) for deployments without Access.
 * - CORS: only ALLOWED_ORIGIN.
 */
export interface Env {
  ANTHROPIC_API_KEY: string
  USAGE: KVNamespace
  DAILY_TOKEN_CAP?: string // e.g. "2000000"
  ALLOWED_ORIGIN?: string // e.g. "https://studio.example.pages.dev"
  STUDIO_TOKEN?: string // optional shared secret; if set, requests must send x-studio-token
  ANTHROPIC_VERSION?: string
}

const ANTHROPIC = 'https://api.anthropic.com'

function cors(env: Env, extra: HeadersInit = {}): Headers {
  const h = new Headers(extra)
  h.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN ?? '*')
  h.set('Access-Control-Allow-Headers', 'content-type, x-studio-token, anthropic-version')
  h.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  h.set('Vary', 'Origin')
  return h
}

function json(env: Env, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: cors(env, { 'content-type': 'application/json' }) })
}

function dayKey(): string {
  return `usage:${new Date().toISOString().slice(0, 10)}`
}

export async function readUsage(env: Env): Promise<{ input: number; output: number; calls: number }> {
  const raw = await env.USAGE.get(dayKey())
  return raw ? JSON.parse(raw) : { input: 0, output: 0, calls: 0 }
}

async function addUsage(env: Env, input: number, output: number): Promise<void> {
  const u = await readUsage(env)
  u.input += input
  u.output += output
  u.calls += 1
  await env.USAGE.put(dayKey(), JSON.stringify(u), { expirationTtl: 60 * 60 * 24 * 40 })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })

    if (env.STUDIO_TOKEN && request.headers.get('x-studio-token') !== env.STUDIO_TOKEN) return json(env, 401, { error: 'missing or wrong x-studio-token' })

    if (url.pathname === '/api/usage' && request.method === 'GET') {
      const u = await readUsage(env)
      return json(env, 200, { ...u, cap: Number(env.DAILY_TOKEN_CAP ?? 0) || null, day: dayKey().slice(6) })
    }

    if (url.pathname.startsWith('/api/anthropic/') && request.method === 'POST') {
      const cap = Number(env.DAILY_TOKEN_CAP ?? 0)
      if (cap > 0) {
        const u = await readUsage(env)
        if (u.input + u.output >= cap) return json(env, 429, { error: `Daily token cap of ${cap} reached. Try again tomorrow or raise DAILY_TOKEN_CAP.`, usage: u })
      }
      const target = ANTHROPIC + url.pathname.replace(/^\/api\/anthropic/, '')
      const headers = new Headers()
      headers.set('content-type', 'application/json')
      headers.set('x-api-key', env.ANTHROPIC_API_KEY)
      headers.set('anthropic-version', env.ANTHROPIC_VERSION ?? '2023-06-01')
      const body = await request.text()
      const upstream = await fetch(target, { method: 'POST', headers, body })
      const text = await upstream.text()
      try {
        const parsed = JSON.parse(text)
        const usage = parsed?.usage
        if (usage && typeof usage.input_tokens === 'number') await addUsage(env, usage.input_tokens, usage.output_tokens ?? 0)
      } catch {
        /* streaming or non-JSON: not counted */
      }
      return new Response(text, { status: upstream.status, headers: cors(env, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }) })
    }

    return json(env, 404, { error: 'not found' })
  },
}
