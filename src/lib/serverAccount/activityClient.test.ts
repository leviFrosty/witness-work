import { describe, expect, it, vi } from 'vitest'
import type { RequestOptions } from '@/lib/http/request'
import {
  type AuthorizedRequest,
  fetchAccountActivity,
  fetchAccountDevices,
  revokeAccountDevice,
} from '@/lib/serverAccount/activityClient'
import {
  openDeviceLabel,
  sealDeviceLabel,
} from '@/lib/serverAccount/deviceLabel'
import { createDeviceLabelReader } from '@/lib/serverAccount/activityLabels'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

const BASE = 'https://api.example'
const ID = (n: number) => `${'A'.repeat(21)}${n}`

const answering = (data: unknown) => {
  const calls: RequestOptions[] = []
  const request = vi.fn(async (options: RequestOptions) => {
    calls.push(options)
    return { status: 200, headers: new Headers(), data }
  }) as unknown as AuthorizedRequest
  return { request, calls }
}

describe('fetchAccountDevices', () => {
  it('reads live sessions and drops ones that don’t parse', async () => {
    const device = {
      sessionId: ID(1),
      platform: 'ios',
      device: 'sealed',
      current: true,
      createdAt: 1,
      lastActiveAt: 2,
      expiresAt: 3,
    }
    const { request, calls } = answering({
      ok: true,
      sessions: [
        device,
        { ...device, sessionId: ID(2), device: undefined, platform: 'android' },
        { ...device, sessionId: 'short' },
        { ...device, platform: 'windows' },
        'nope',
      ],
    })
    expect(await fetchAccountDevices({ baseUrl: BASE, request })).toEqual([
      device,
      { ...device, sessionId: ID(2), device: null, platform: 'android' },
    ])
    expect(calls[0]).toMatchObject({
      url: `${BASE}/accounts/v1/sessions`,
      method: 'GET',
    })
  })

  it('refuses an answer without a list', async () => {
    const { request } = answering({ ok: true })
    await expect(
      fetchAccountDevices({ baseUrl: BASE, request })
    ).rejects.toThrow()
  })
})

describe('revokeAccountDevice', () => {
  it('posts the session id in the body, never the URL', async () => {
    const { request, calls } = answering({ ok: true })
    await revokeAccountDevice(ID(7), { baseUrl: BASE, request })
    expect(calls[0]).toMatchObject({
      url: `${BASE}/accounts/v1/sessions/revoke`,
      method: 'POST',
      json: { sessionId: ID(7) },
      idempotent: true,
    })
  })
})

describe('fetchAccountActivity', () => {
  it('pages by cursor and skips kinds this version doesn’t know', async () => {
    const { request, calls } = answering({
      ok: true,
      activity: [
        {
          id: '9',
          kind: 'session.revoked',
          createdAt: 5,
          session: { sessionId: ID(1), platform: 'android', device: 'x' },
          actor: { sessionId: ID(2) },
        },
        { id: '8', kind: 'buddies.photo_shared', createdAt: 4 },
        { id: '7', kind: 'backup.deleted', createdAt: 3 },
        { id: '6', kind: 'backup.downloaded', createdAt: 2, slotId: ID(3) },
        { id: 5, kind: 'account.created', createdAt: 1 },
      ],
      nextCursor: '6',
    })
    const page = await fetchAccountActivity(
      { before: '10', limit: 50 },
      { baseUrl: BASE, request }
    )
    expect(calls[0].url).toBe(`${BASE}/accounts/v1/activity?limit=50&before=10`)
    expect(page).toEqual({
      nextCursor: '6',
      entries: [
        {
          id: '9',
          kind: 'session.revoked',
          createdAt: 5,
          session: { sessionId: ID(1), platform: 'android', device: 'x' },
          actor: { sessionId: ID(2), platform: null, device: null },
          slotId: null,
        },
        {
          id: '7',
          kind: 'backup.deleted',
          createdAt: 3,
          session: null,
          actor: null,
          slotId: null,
        },
        {
          id: '6',
          kind: 'backup.downloaded',
          createdAt: 2,
          session: null,
          actor: null,
          slotId: ID(3),
        },
      ],
    })
  })

  it('treats a missing cursor as the last page', async () => {
    const { request, calls } = answering({ ok: true, activity: [] })
    expect(await fetchAccountActivity({}, { baseUrl: BASE, request })).toEqual({
      entries: [],
      nextCursor: null,
    })
    expect(calls[0].url).toBe(`${BASE}/accounts/v1/activity`)
  })
})

describe('createDeviceLabelReader', () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i)
  const label = {
    name: 'Pixel 9',
    platform: 'android' as const,
    model: 'Pixel 9',
  }
  const sealed = sealDeviceLabel(
    key,
    deriveAccountSigningKey(key).publicKey,
    label,
    new Uint8Array(12)
  )

  it('opens this account’s labels and reads anything else as null', () => {
    const read = createDeviceLabelReader(key)
    expect(read(sealed)).toEqual(label)
    expect(read(null)).toBeNull()
    expect(read('not-a-label')).toBeNull()
    expect(
      createDeviceLabelReader(new Uint8Array(32).fill(7))(sealed)
    ).toBeNull()

    expect(read(sealed)).toEqual(
      openDeviceLabel(key, deriveAccountSigningKey(key).publicKey, sealed)
    )
  })
})
