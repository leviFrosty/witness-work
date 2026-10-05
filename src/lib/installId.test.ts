import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  os: 'android' as 'android' | 'ios',
  androidId: 'dd96dec43fb81c97' as string | null,
  applicationId: 'com.leviwilkerson.jwtime' as string | null,
  keychain: null as string | null,
  store: new Map<string, string>(),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
}))
vi.mock('expo-application', () => ({
  getAndroidId: () => {
    if (runtime.androidId === 'throw') throw new Error('unavailable')
    return runtime.androidId
  },
  get applicationId() {
    return runtime.applicationId
  },
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'random-uuid-0000-0000-000000000000',
}))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString(key: string) {
      return runtime.store.get(key)
    }
    set(key: string, value: string) {
      runtime.store.set(key, value)
    }
  },
}))
vi.mock('../../modules/keychain-uuid', () => ({
  getOrCreate: () => runtime.keychain,
}))

const freshModule = async () => {
  vi.resetModules()
  return import('./installId')
}

beforeEach(() => {
  runtime.os = 'android'
  runtime.androidId = 'dd96dec43fb81c97'
  runtime.applicationId = 'com.leviwilkerson.jwtime'
  runtime.keychain = null
  runtime.store = new Map()
})

describe('androidInstallIdFrom', () => {
  it('derives a stable RFC 9562 version-8 UUID per app and device', async () => {
    const { androidInstallIdFrom } = await freshModule()
    const id = androidInstallIdFrom(
      'dd96dec43fb81c97',
      'com.leviwilkerson.jwtime'
    )

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(
      androidInstallIdFrom('dd96dec43fb81c97', 'com.leviwilkerson.jwtime')
    ).toBe(id)
    expect(
      androidInstallIdFrom('dd96dec43fb81c97', 'com.leviwilkerson.jwtimedev')
    ).not.toBe(id)
    expect(
      androidInstallIdFrom('0123456789abcdef', 'com.leviwilkerson.jwtime')
    ).not.toBe(id)
  })
})

describe('getOrCreateInstallId on Android', () => {
  it('derives a new install id from ANDROID_ID and persists it', async () => {
    const { getOrCreateInstallId, androidInstallIdFrom } = await freshModule()
    const expected = androidInstallIdFrom(
      'dd96dec43fb81c97',
      'com.leviwilkerson.jwtime'
    )

    expect(getOrCreateInstallId()).toBe(expected)
    expect(runtime.store.get('installId')).toBe(expected)
  })

  it('derives the same id again after storage is cleared or the app reinstalled', async () => {
    const first = (await freshModule()).getOrCreateInstallId()
    runtime.store = new Map()

    expect((await freshModule()).getOrCreateInstallId()).toBe(first)
  })

  it('keeps an existing id so RevenueCat identity does not change', async () => {
    runtime.store.set('installId', 'existing-random-install-id')
    expect((await freshModule()).getOrCreateInstallId()).toBe(
      'existing-random-install-id'
    )
  })

  it.each([null, '', 'throw'])(
    'falls back to a random id when ANDROID_ID is %j',
    async (androidId) => {
      runtime.androidId = androidId
      expect((await freshModule()).getOrCreateInstallId()).toBe(
        'random-uuid-0000-0000-000000000000'
      )
    }
  )
})

describe('getOrCreateInstallId on iOS', () => {
  it('uses the Keychain id and never reads ANDROID_ID', async () => {
    runtime.os = 'ios'
    runtime.keychain = 'KEYCHAIN-UUID'
    expect((await freshModule()).getOrCreateInstallId()).toBe('KEYCHAIN-UUID')
  })

  it('falls back to a random MMKV id without the Keychain module', async () => {
    runtime.os = 'ios'
    expect((await freshModule()).getOrCreateInstallId()).toBe(
      'random-uuid-0000-0000-000000000000'
    )
  })
})
