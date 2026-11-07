import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMMKV } from '@/lib/webStorage/webMmkv'
import WebAsyncStorage from '@/lib/webStorage/webAsyncStorage'
import { webStores } from '@/lib/webStorage/webStores'

beforeAll(() => webStores.hydrate())

describe('web MMKV', () => {
  it('reads each value back with the type it was set with', () => {
    const mmkv = createMMKV({ id: 'typed' })
    mmkv.set('s', 'text')
    mmkv.set('n', 4)
    mmkv.set('b', true)
    mmkv.set('buf', new Uint8Array([9]).buffer)
    expect(mmkv.getString('s')).toBe('text')
    expect(mmkv.getNumber('n')).toBe(4)
    expect(mmkv.getBoolean('b')).toBe(true)
    expect(new Uint8Array(mmkv.getBuffer('buf')!)).toEqual(new Uint8Array([9]))
    expect(mmkv.getString('n')).toBeUndefined()
    expect(mmkv.getAllKeys().sort()).toEqual(['b', 'buf', 'n', 's'])
    expect(mmkv.size).toBe(4)
  })

  it('keeps instances apart, and clears one without the other', () => {
    const a = createMMKV({ id: 'server-account' })
    const b = createMMKV({ id: 'install-id' })
    a.set('k', 'a')
    b.set('k', 'b')
    a.clearAll()
    expect(a.contains('k')).toBe(false)
    expect(b.getString('k')).toBe('b')
    b.delete('k')
    expect(b.contains('k')).toBe(false)
  })

  it('refuses an encryption key, as MMKV’s own web build does', () => {
    expect(() =>
      createMMKV({ id: 'app-attest-lifecycle-v2', encryptionKey: 'k' })
    ).toThrow(/encryptionKey/)
  })

  it('backs AsyncStorage with the same database', async () => {
    await WebAsyncStorage.setItem('legacy', '{"a":1}')
    await WebAsyncStorage.mergeItem('legacy', '{"b":2}')
    expect(await WebAsyncStorage.getItem('legacy')).toBe('{"a":1,"b":2}')
    expect(await WebAsyncStorage.getAllKeys()).toEqual(['legacy'])
    expect(webStores.get('async-storage', 'legacy')).toBe('{"a":1,"b":2}')
    await WebAsyncStorage.clear()
    expect(await WebAsyncStorage.getItem('legacy')).toBeNull()
  })

  it('reads and writes several AsyncStorage keys at once', async () => {
    await WebAsyncStorage.multiSet([
      ['a', '1'],
      ['b', '2'],
    ])
    expect(await WebAsyncStorage.multiGet(['a', 'b', 'missing'])).toEqual([
      ['a', '1'],
      ['b', '2'],
      ['missing', null],
    ])
    await WebAsyncStorage.multiRemove(['a'])
    expect(await WebAsyncStorage.getAllKeys()).toEqual(['b'])
    await WebAsyncStorage.clear()
  })
})
