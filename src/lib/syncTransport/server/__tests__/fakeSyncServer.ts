import { sha256 } from '@noble/hashes/sha2.js'
import { toB64u } from '@/lib/bytes'

export type FakeSyncServer = ReturnType<typeof createFakeSyncServer>

type Slot = { bytes: Uint8Array; etag: string; updatedAt: number }

export function createFakeSyncServer() {
  const accounts = new Map<string, Map<string, Slot>>()
  let seq = 0
  let clock = 0
  const state = {
    enabled: true,
    entitlement: 'supporter' as 'supporter' | 'everyone',
    supporters: new Set<string>(),

    putDelayMs: 0,

    log: [] as string[],
  }

  const slotsOf = (account: string) => {
    let slots = accounts.get(account)
    if (!slots) accounts.set(account, (slots = new Map()))
    return slots
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  const refuse = (code: string, status: number) =>
    json({ ok: false, error: code, code }, status)

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const op = url.pathname.replace(/^\/accounts\/v1\//, '')
    const method = init?.method ?? 'GET'
    state.log.push(`${method} ${op}`)
    const headers = new Headers(init?.headers)
    const account = headers.get('authorization')?.replace(/^Bearer /, '')
    if (!account) return refuse('unauthorized', 401)
    const entitled =
      state.enabled &&
      (state.entitlement === 'everyone' || state.supporters.has(account))
    if (op === 'sync' && method === 'GET')
      return json({
        ok: true,
        enabled: state.enabled,
        entitled,
        entitlement: state.entitlement,
        supporter: state.supporters.has(account),
      })
    const slots = slotsOf(account)
    if (op === 'sync/delete') {
      const { slotId } = JSON.parse(String(init?.body ?? '{}')) as {
        slotId?: string
      }
      if (slotId) slots.delete(slotId)
      else slots.clear()
      return json({ ok: true, seq: ++seq })
    }
    if (!state.enabled) return refuse('disabled', 503)
    if (!entitled) return refuse('supporter_required', 403)
    switch (op) {
      case 'sync/put': {
        const slotId = headers.get('x-ww-slot-id')!
        const bytes = new Uint8Array(init!.body as Uint8Array)
        const etag = toB64u(sha256(bytes))
        if (etag !== headers.get('x-ww-sha256'))
          return refuse('bad_request', 400)
        if (state.putDelayMs)
          await new Promise((resolve) => setTimeout(resolve, state.putDelayMs))
        const updatedAt = (clock = Math.max(clock + 1, Date.now()))
        slots.set(slotId, { bytes, etag, updatedAt })
        return json({
          ok: true,
          etag,
          size: bytes.length,
          updatedAt,
          seq: ++seq,
        })
      }
      case 'sync/list':
        return json({
          ok: true,
          seq,
          slots: [...slots].map(([slotId, slot]) => ({
            slotId,
            etag: slot.etag,
            size: slot.bytes.length,
            updatedAt: slot.updatedAt,
          })),
        })
      case 'sync/get': {
        const { slotId } = JSON.parse(String(init?.body)) as { slotId: string }
        const slot = slots.get(slotId)
        if (!slot) return refuse('not_found', 404)
        return new Response(slot.bytes.slice(), {
          headers: { 'content-type': 'application/octet-stream' },
        })
      }
    }
    return refuse('not_found', 404)
  }

  return {
    state,
    fetch: fetchImpl,

    seq: () => seq,

    slotIds: (account: string) => [...slotsOf(account).keys()].sort(),

    slotBytes: (account: string, slotId: string) =>
      slotsOf(account).get(slotId)?.bytes ?? null,
  }
}
