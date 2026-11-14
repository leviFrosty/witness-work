import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from '../types'
import { makeMemoryKv, type MemoryKv } from '../test/memoryKv'
import {
  anyHostServesTools,
  buildStatusResponse,
  getPublicScribeStatus,
  resetPublicScribeStatus,
  resolveScribeAvailability,
} from './status'

const NOW = Date.UTC(2026, 9, 21, 14)

const endpoint = (fields: Record<string, unknown> = {}) => ({
  provider_name: 'Azure',
  tag: 'azure',
  status: 0,
  supported_parameters: ['tools', 'tool_choice', 'reasoning'],
  ...fields,
})

const endpoints = (...list: Record<string, unknown>[]) =>
  new Response(JSON.stringify({ data: { endpoints: list } }), { status: 200 })

let kv: MemoryKv
let env: Environment

beforeEach(() => {
  kv = makeMemoryKv()
  env = { NOTES_KV: kv, OPENROUTER_API_KEY: 'or-test' } as unknown as Environment
  resetPublicScribeStatus(env)
})

/** A probe that answers per model from `hosts`, counting calls. */
const probe = (hosts: Record<string, Record<string, unknown>[] | 'error'>) => {
  const fn = vi.fn(async (url: string | URL | Request) => {
    const model = decodeURIComponent(String(url).split('/models/')[1].replace('/endpoints', ''))
    const answer = hosts[model]
    if (answer === 'error' || answer === undefined) return new Response('down', { status: 503 })
    return endpoints(...answer)
  })
  return fn as unknown as typeof fetch & typeof fn
}

const availability = (fetchFn: typeof fetch, now = () => NOW, waitUntil?: (p: Promise<unknown>) => void) =>
  resolveScribeAvailability({ env, fetchFn, now, waitUntil })

describe('anyHostServesTools', () => {
  it('needs an allowlisted, healthy host that serves tools', () => {
    const body = (...list: Record<string, unknown>[]) => ({ data: { endpoints: list } })
    expect(anyHostServesTools(body(endpoint()), ['azure'])).toBe(true)
    expect(anyHostServesTools(body(endpoint({ supported_parameters: ['tool_choice'] })), ['azure'])).toBe(false)
    expect(anyHostServesTools(body(endpoint({ status: -2 })), ['azure'])).toBe(false)
    expect(anyHostServesTools(body(endpoint({ provider_name: 'DeepInfra', tag: 'deepinfra' })), ['azure'])).toBe(false)
    expect(anyHostServesTools(body(endpoint({ provider_name: 'Azure', tag: 'azure/us' })), ['azure'])).toBe(true)
    expect(anyHostServesTools({}, ['azure'])).toBe(false)
  })
})

describe('kill switch', () => {
  it.each(['false', 'off', '0', 'disabled', '{"available":false}'])('%s turns Scribe AI off', async (value) => {
    await kv.put('scribe:enabled', value)
    const fetchFn = probe({})
    const result = await availability(fetchFn)
    expect(result).toMatchObject({ enabled: false, reason: 'disabled', target: null })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('stays on for anything else', async () => {
    await kv.put('scribe:enabled', 'true')
    const result = await availability(probe({ 'openai/gpt-6-luna': [endpoint()] }))
    expect(result).toMatchObject({ enabled: true, reason: null })
  })
})

describe('provider health', () => {
  it('uses the primary when an allowlisted host serves tools', async () => {
    const result = await availability(probe({ 'openai/gpt-6-luna': [endpoint()] }))
    expect(result.target).toEqual({ model: 'openai/gpt-6-luna', providers: ['azure'] })
    expect(JSON.parse(kv.store.get('scribe:provider-health')!)).toMatchObject({
      selection: 'primary',
      checkedAt: NOW,
    })
  })

  it('reports no_provider when the host lacks tools and there is no fallback', async () => {
    const result = await availability(
      probe({ 'openai/gpt-6-luna': [endpoint({ supported_parameters: ['reasoning'] })] })
    )
    expect(result).toMatchObject({ enabled: false, reason: 'no_provider', target: null })
  })

  it('selects the fallback when the primary has no tool-serving host', async () => {
    await kv.put(
      'scribe:model',
      JSON.stringify({ fallback: { model: 'openai/gpt-6-sol', providers: ['openai'] } })
    )
    const result = await availability(
      probe({
        'openai/gpt-6-luna': [endpoint({ supported_parameters: [] })],
        'openai/gpt-6-sol': [endpoint({ provider_name: 'OpenAI', tag: 'openai' })],
      })
    )
    expect(result).toMatchObject({
      enabled: true,
      target: { model: 'openai/gpt-6-sol', providers: ['openai'] },
    })
  })

  it('fails open to the primary when the probe errors, without caching', async () => {
    const result = await availability(probe({ 'openai/gpt-6-luna': 'error' }))
    expect(result).toMatchObject({ enabled: true, probeFailed: true })
    expect(result.target?.model).toBe('openai/gpt-6-luna')
    expect(kv.store.has('scribe:provider-health')).toBe(false)
  })

  it('fails open when KV is unreadable', async () => {
    env = { ...env, NOTES_KV: { get: async () => Promise.reject(new Error('kv')) } } as never
    const result = await availability(probe({}))
    expect(result).toMatchObject({ enabled: true, probeFailed: true })
  })

  it('serves a fresh cached answer without probing, and re-probes a changed config', async () => {
    const fetchFn = probe({ 'openai/gpt-6-luna': [endpoint()], 'openai/gpt-6-sol': [] })
    await availability(fetchFn)
    await availability(fetchFn, () => NOW + 59_000)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await kv.put('scribe:model', JSON.stringify({ model: 'openai/gpt-6-sol' }))
    const changed = await availability(fetchFn, () => NOW + 59_000)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(changed.reason).toBe('no_provider')
  })

  it('serves a stale answer while it refreshes in the background', async () => {
    const fetchFn = probe({ 'openai/gpt-6-luna': [endpoint()] })
    await availability(fetchFn)
    const pending: Promise<unknown>[] = []
    const result = await availability(fetchFn, () => NOW + 61_000, (p) => pending.push(p))
    expect(result.enabled).toBe(true)
    expect(pending).toHaveLength(1)
    await Promise.all(pending)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(JSON.parse(kv.store.get('scribe:provider-health')!).checkedAt).toBe(NOW + 61_000)
  })
})

describe('public status', () => {
  it('answers the protocol’s status shape', async () => {
    await kv.put('scribe:disabled-tools', '["visits_delete"]')
    await kv.put('scribe:min-version', '1.46.0')
    await kv.put('scribe:limits', '{"maxStepsPerTurn":4}')
    const status = buildStatusResponse(await availability(probe({ 'openai/gpt-6-luna': [endpoint()] })))
    expect(status).toEqual({
      ok: true,
      enabled: true,
      reason: null,
      protocol: { min: 1, max: 1 },
      minAppVersion: '1.46.0',
      disabledTools: ['visits_delete'],
      limits: {
        maxInputTokens: 48_000,
        maxOutputTokens: 4_096,
        maxStepsPerTurn: 4,
        maxTools: 24,
        maxToolsBytes: 32_768,
        maxToolSchemaBytes: 4_096,
        maxToolDescriptionChars: 1_024,
        maxRequestBytes: 393_216,
        maxContextBytes: 16_384,
        maxUserTextChars: 32_000,
        maxToolResultBytes: 8_192,
        transcribe: { maxBytes: 4_194_304, mimeTypes: ['image/jpeg', 'image/png'] },
      },
    })
  })

  it('reuses the answer for 30 seconds per isolate', async () => {
    const fetchFn = probe({ 'openai/gpt-6-luna': [endpoint()] })
    vi.stubGlobal('fetch', fetchFn)
    try {
      expect((await getPublicScribeStatus(env, undefined, () => NOW)).enabled).toBe(true)
      await kv.put('scribe:enabled', 'off')
      expect((await getPublicScribeStatus(env, undefined, () => NOW + 29_000)).enabled).toBe(true)
      expect((await getPublicScribeStatus(env, undefined, () => NOW + 30_000)).enabled).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
