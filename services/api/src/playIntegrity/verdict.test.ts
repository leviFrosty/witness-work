import { describe, expect, it } from 'vitest'
import type { PlayIntegrityConfig } from './config'
import { evaluateVerdict, type TokenPayload } from './verdict'

const NOW = 1_800_000_000_000
const BINDING = 'b'.repeat(64)
const CERT = 'q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c'

const config: PlayIntegrityConfig = {
  packageName: 'com.example.app',
  cloudProjectNumber: '123456789012',
  serviceAccountJson: '{}',
  certificateDigests: [],
  requiredDeviceVerdict: 'MEETS_DEVICE_INTEGRITY',
}

const genuine = (): TokenPayload => ({
  requestDetails: {
    requestPackageName: 'com.example.app',
    requestHash: BINDING,
    timestampMillis: String(NOW - 2_000),
  },
  appIntegrity: {
    appRecognitionVerdict: 'PLAY_RECOGNIZED',
    packageName: 'com.example.app',
    certificateSha256Digest: [CERT],
    versionCode: '142',
  },
  deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
})

const expected = {
  requestBinding: BINDING,
  challengeIssuedAt: NOW - 10_000,
  now: NOW,
}

describe('evaluateVerdict', () => {
  it('accepts a Play-recognized app on a device meeting device integrity', () => {
    expect(evaluateVerdict(genuine(), config, expected)).toEqual({ ok: true })
  })

  it.each([
    [
      'another package',
      { requestPackageName: 'com.attacker.app' },
      'request package mismatch',
    ],
    ['another request', { requestHash: 'c'.repeat(64) }, 'request hash mismatch'],
    [
      'a token older than its challenge',
      { timestampMillis: String(NOW - 120_000) },
      'token timestamp out of range',
    ],
    [
      'a future timestamp',
      { timestampMillis: String(NOW + 120_000) },
      'token timestamp out of range',
    ],
    [
      'a missing timestamp',
      { timestampMillis: undefined },
      'token timestamp out of range',
    ],
  ])('rejects a token for %s as invalid', (_name, override, detail) => {
    const payload = genuine()
    payload.requestDetails = { ...payload.requestDetails, ...override }
    expect(evaluateVerdict(payload, config, expected)).toEqual({
      ok: false,
      reason: 'integrity_token_invalid',
      detail,
    })
  })

  it.each([
    ['an empty device verdict (replayed or failing device)', []],
    ['only basic integrity', ['MEETS_BASIC_INTEGRITY']],
    ['only virtual integrity', ['MEETS_VIRTUAL_INTEGRITY']],
  ])('rejects %s when device integrity is required', (_name, verdicts) => {
    const payload = genuine()
    payload.deviceIntegrity = { deviceRecognitionVerdict: verdicts }
    expect(evaluateVerdict(payload, config, expected)).toMatchObject({
      ok: false,
      reason: 'device_integrity_failed',
    })
  })

  it('treats a stronger device verdict as satisfying a weaker requirement', () => {
    const payload = genuine()
    payload.deviceIntegrity = {
      deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY', 'MEETS_STRONG_INTEGRITY'],
    }
    expect(evaluateVerdict(payload, config, expected).ok).toBe(true)
    expect(
      evaluateVerdict(
        { ...genuine(), deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] } },
        { ...config, requiredDeviceVerdict: 'MEETS_BASIC_INTEGRITY' },
        expected
      ).ok
    ).toBe(true)
    expect(
      evaluateVerdict(
        genuine(),
        { ...config, requiredDeviceVerdict: 'MEETS_STRONG_INTEGRITY' },
        expected
      )
    ).toMatchObject({ ok: false, reason: 'device_integrity_failed' })
  })

  it.each(['UNRECOGNIZED_VERSION', 'UNEVALUATED', undefined])(
    'rejects app recognition %s',
    (verdict) => {
      const payload = genuine()
      payload.appIntegrity = { ...payload.appIntegrity, appRecognitionVerdict: verdict }
      expect(evaluateVerdict(payload, config, expected)).toMatchObject({
        ok: false,
        reason: 'app_not_recognized',
      })
    }
  )

  it('rejects a recognized app under another package name', () => {
    const payload = genuine()
    payload.appIntegrity = { ...payload.appIntegrity, packageName: 'com.other' }
    expect(evaluateVerdict(payload, config, expected)).toMatchObject({
      ok: false,
      reason: 'app_not_recognized',
    })
  })

  it('pins the signing certificate only when digests are configured', () => {
    const pinned = { ...config, certificateDigests: ['other-digest', CERT] }
    expect(evaluateVerdict(genuine(), pinned, expected).ok).toBe(true)
    expect(
      evaluateVerdict(
        genuine(),
        { ...config, certificateDigests: ['other-digest'] },
        expected
      )
    ).toEqual({
      ok: false,
      reason: 'app_not_recognized',
      detail: 'signing certificate mismatch',
    })
  })

  it('does not require a licensing verdict', () => {
    const payload = {
      ...genuine(),
      accountDetails: { appLicensingVerdict: 'UNLICENSED' },
    } as TokenPayload
    expect(evaluateVerdict(payload, config, expected).ok).toBe(true)
  })
})
