import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTestKey, verifyJwt } from '../test/mapkit'
import {
  allowsLocalFrame,
  parseFrameOrigins,
  readMapKitConfig,
  resetMapKitKeyCache,
  signMapKitToken,
} from './mapkitToken'

beforeEach(() => {
  resetMapKitKeyCache()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('signMapKitToken', () => {
  it('signs an ES256 JWT with the MapKit JS header and claims', async () => {
    const { pem, publicKey } = await generateTestKey()
    const { token, claims } = await signMapKitToken(
      { keyId: 'ABCDE12345', teamId: 'TEAM123456', privateKey: pem },
      'https://maps.witnesswork.app',
      1_800_000_000,
      1800
    )
    const decoded = await verifyJwt(token, publicKey)
    expect(decoded.valid).toBe(true)
    // Raw r || s, as JOSE wants, not DER.
    expect(decoded.signatureBytes).toBe(64)
    expect(decoded.header).toEqual({
      alg: 'ES256',
      kid: 'ABCDE12345',
      typ: 'JWT',
    })
    expect(decoded.claims).toEqual({
      iss: 'TEAM123456',
      iat: 1_800_000_000,
      exp: 1_800_001_800,
      origin: 'https://maps.witnesswork.app',
      scope: 'mapkit_js',
    })
    expect(claims).toEqual(decoded.claims)
  })

  it('reads a PEM stored with literal \\n sequences', async () => {
    const { pem, publicKey } = await generateTestKey()
    const { token } = await signMapKitToken(
      {
        keyId: 'ABCDE12345',
        teamId: 'TEAM123456',
        privateKey: pem.replace(/\n/g, '\\n'),
      },
      'https://maps.witnesswork.app',
      1_800_000_000,
      1800
    )
    expect((await verifyJwt(token, publicKey)).valid).toBe(true)
  })

  it('rejects a key that is not PKCS#8 P-256', async () => {
    await expect(
      signMapKitToken(
        { keyId: 'ABCDE12345', teamId: 'TEAM123456', privateKey: 'not a key' },
        'https://maps.witnesswork.app',
        0,
        1800
      )
    ).rejects.toThrow()
  })
})

describe('parseFrameOrigins', () => {
  it('keeps bare https origins, in order, once each', () => {
    expect(
      parseFrameOrigins(
        ' https://maps.witnesswork.app , https://maps-beta.witnesswork.app:8443,https://maps.witnesswork.app',
        false
      )
    ).toEqual([
      'https://maps.witnesswork.app',
      'https://maps-beta.witnesswork.app:8443',
    ])
  })

  it('drops paths, wildcards, odd hosts, and other schemes', () => {
    for (const entry of [
      'https://maps.witnesswork.app/',
      'https://maps.witnesswork.app/frame',
      '*.witnesswork.app',
      'https://*',
      'https://*.*',
      'https://*.witnesswork.app',
      'https://a*b.example',
      'https://trail.example.',
      'https://-bad.example',
      'https://localhost',
      'https://203.0.113.5',
      'maps.witnesswork.app',
      'ftp://maps.witnesswork.app',
      'https://user@maps.witnesswork.app',
      'https://MAPS.witnesswork.app',
      'https://maps.witnesswork.app:443',
    ])
      expect(parseFrameOrigins(entry, true), entry).toEqual([])
    expect(console.warn).toHaveBeenCalled()
  })

  it('allows a local http frame only when local frames are allowed', () => {
    const local = 'http://localhost:8081, http://127.0.0.1:5173, http://[::1]:3000'
    expect(parseFrameOrigins(local, true)).toEqual([
      'http://localhost:8081',
      'http://127.0.0.1:5173',
      'http://[::1]:3000',
    ])
    expect(parseFrameOrigins(local, false)).toEqual([])
    expect(parseFrameOrigins('http://maps-beta.witnesswork.app', true)).toEqual(
      []
    )
  })

  it('warns once per bad value, not per request', () => {
    vi.mocked(console.warn).mockClear()
    parseFrameOrigins('https://*', false)
    parseFrameOrigins('https://*', false)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('allowsLocalFrame', () => {
  it('needs a development worker served from a local host', () => {
    expect(allowsLocalFrame('development', 'http://127.0.0.1:8792/x')).toBe(true)
    expect(allowsLocalFrame('development', 'http://localhost/x')).toBe(true)
    expect(
      allowsLocalFrame(
        'development',
        'https://api.example/x'
      )
    ).toBe(false)
    expect(allowsLocalFrame('production', 'http://127.0.0.1:8792/x')).toBe(
      false
    )
  })
})

describe('readMapKitConfig', () => {
  const env = {
    MAPKIT_JS_PRIVATE_KEY: 'pem',
    MAPKIT_JS_KEY_ID: 'ABCDE12345',
    MAPKIT_JS_ORIGINS: 'https://maps.witnesswork.app',
    APPLE_TEAM_ID: 'TEAM123456',
  }

  it('needs the key, its id, the team id, and an origin', () => {
    expect(readMapKitConfig(env, false)).toEqual({
      keyId: 'ABCDE12345',
      teamId: 'TEAM123456',
      privateKey: 'pem',
      origins: ['https://maps.witnesswork.app'],
    })
    for (const missing of [
      { MAPKIT_JS_PRIVATE_KEY: undefined },
      { MAPKIT_JS_PRIVATE_KEY: '  ' },
      { MAPKIT_JS_KEY_ID: undefined },
      { MAPKIT_JS_KEY_ID: 'short' },
      { APPLE_TEAM_ID: '' },
      { MAPKIT_JS_ORIGINS: undefined },
      { MAPKIT_JS_ORIGINS: 'http://localhost:8081' },
    ]) {
      expect(readMapKitConfig({ ...env, ...missing }, false)).toBeNull()
    }
  })
})
