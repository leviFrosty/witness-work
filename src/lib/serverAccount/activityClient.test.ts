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

/** The devices and activity routes (docs/accounts-protocol.md, ADR 0028). */

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
        {
          ...device,
          sessionId: ID(4),
          platform: 'web',
          appVersion: '2.1.0',
          method: 'passkey',
        },
        { ...device, sessionId: 'short' },
        'nope',
      ],
    })
    const known = { appVersion: null }
    expect(await fetchAccountDevices({ baseUrl: BASE, request })).toEqual([
      { ...device, ...known },
      {
        ...device,
        ...known,
        sessionId: ID(2),
        device: null,
        platform: 'android',
      },
      {
        ...device,
        sessionId: ID(4),
        platform: 'web',
        appVersion: '2.1.0',
      },
    ])
    expect(calls[0]).toMatchObject({
      url: `${BASE}/accounts/v1/sessions`,
      method: 'GET',
    })
  })

  it('keeps a session of a platform it doesn’t know, with no platform', async () => {
    const { request } = answering({
      ok: true,
      sessions: [
        {
          sessionId: ID(1),
          platform: 'windows',
          current: false,
          createdAt: 1,
          lastActiveAt: 2,
          expiresAt: 3,
        },
      ],
    })
    const devices = await fetchAccountDevices({ baseUrl: BASE, request })
    expect(devices).toHaveLength(1)
    expect(devices[0]).toMatchObject({ sessionId: ID(1), platform: null })
  })

  it('keeps a browser session and ignores a version it can’t read', async () => {
    const web = {
      sessionId: ID(1),
      platform: 'web',
      current: false,
      createdAt: 1,
      lastActiveAt: 2,
      expiresAt: 3,
    }
    const { request } = answering({
      ok: true,
      sessions: [
        { ...web, appVersion: '1.2.3' },
        { ...web, sessionId: ID(2), appVersion: 4 },
        { ...web, sessionId: ID(3), appVersion: '' },
      ],
    })
    const devices = await fetchAccountDevices({ baseUrl: BASE, request })
    expect(devices.map((d) => [d.platform, d.appVersion])).toEqual([
      ['web', '1.2.3'],
      ['web', null],
      ['web', null],
    ])
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
        {
          id: '10',
          kind: 'session.opened',
          createdAt: 6,
          method: 'approval',
          session: { sessionId: ID(5), platform: 'web', device: 'y' },
          actor: { sessionId: ID(2), platform: 'ios' },
        },
        { id: '7', kind: 'backup.deleted', createdAt: 3 },
        { id: '6', kind: 'backup.downloaded', createdAt: 2, slotId: ID(3) },
        { id: 5, kind: 'account.created', createdAt: 1 },
        { id: '', kind: 'account.created', createdAt: 1 },
        { id: '4', kind: 'account.key_changed', createdAt: 1 },
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
          method: null,
          session: { sessionId: ID(1), platform: 'android', device: 'x' },
          actor: { sessionId: ID(2), platform: null, device: null },
          slotId: null,
        },
        {
          id: '10',
          kind: 'session.opened',
          createdAt: 6,
          method: 'approval',
          session: { sessionId: ID(5), platform: 'web', device: 'y' },
          actor: { sessionId: ID(2), platform: 'ios', device: null },
          slotId: null,
        },
        {
          id: '7',
          kind: 'backup.deleted',
          createdAt: 3,
          method: null,
          session: null,
          actor: null,
          slotId: null,
        },
        {
          id: '6',
          kind: 'backup.downloaded',
          createdAt: 2,
          method: null,
          session: null,
          actor: null,
          slotId: ID(3),
        },
        {
          id: '4',
          kind: 'account.key_changed',
          createdAt: 1,
          method: null,
          session: null,
          actor: null,
          slotId: null,
        },
      ],
    })
  })

  it('reads the passkey and approval kinds, and drops a method it doesn’t know', async () => {
    const session = { sessionId: ID(1), platform: 'web', device: 'x' }
    const { request } = answering({
      ok: true,
      activity: [
        {
          id: '4',
          kind: 'passkey.added',
          createdAt: 4,
          session,
          credentialId: 'c',
        },
        { id: '3', kind: 'passkey.removed', createdAt: 3, session },
        {
          id: '2',
          kind: 'device.approved',
          createdAt: 2,
          session: { sessionId: ID(2), platform: 'ios' },
        },
        {
          id: '1',
          kind: 'session.opened',
          createdAt: 1,
          session,
          method: 'soon',
        },
      ],
    })
    const { entries } = await fetchAccountActivity(
      {},
      { baseUrl: BASE, request }
    )
    expect(entries.map((e) => [e.kind, e.method])).toEqual([
      ['passkey.added', null],
      ['passkey.removed', null],
      ['device.approved', null],
      ['session.opened', null],
    ])
    expect(entries[0].session?.platform).toBe('web')
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
    // The same label opens the same way again (cached).
    expect(read(sealed)).toEqual(
      openDeviceLabel(key, deriveAccountSigningKey(key).publicKey, sealed)
    )
  })

  it('opens a browser’s label', () => {
    const web = { name: 'Chrome on macOS', platform: 'web' as const, model: '' }
    const sealedWeb = sealDeviceLabel(
      key,
      deriveAccountSigningKey(key).publicKey,
      web,
      new Uint8Array(12)
    )
    expect(createDeviceLabelReader(key)(sealedWeb)).toEqual(web)
  })
})
