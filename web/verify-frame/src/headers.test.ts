import { describe, expect, it } from 'vitest'
import environments from '../../../config/web-environments.json'
import {
  appOriginsFor,
  FRAME_ENVIRONMENTS,
  frameContentSecurityPolicy,
  frameHeaders,
  frameHeadersFile,
} from './headers'

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `))
    ?.split(' ')
    .slice(1)

describe('the frame environments', () => {
  it('match the app profiles’ verify origins', () => {
    const origins = new Set(
      Object.values(environments).map((profile) => profile.verifyOrigin)
    )
    expect(
      new Set(Object.values(FRAME_ENVIRONMENTS).map((env) => env.origin))
    ).toEqual(origins)
    expect(FRAME_ENVIRONMENTS.beta?.origin).toBe(
      'https://verify-beta.witnesswork.app'
    )
    expect(FRAME_ENVIRONMENTS.production?.origin).toBe(
      'https://verify.witnesswork.app'
    )
  })

  it('let only their own environments’ apps frame them', () => {
    expect(
      appOriginsFor(FRAME_ENVIRONMENTS.beta!.origin, environments)
    ).toEqual([
      'http://localhost:*',
      'http://127.0.0.1:*',
      'https://beta.app.witnesswork.app',
    ])
    expect(
      appOriginsFor(FRAME_ENVIRONMENTS.production!.origin, environments)
    ).toEqual(['https://app.witnesswork.app'])
  })
})

describe('the frame CSP', () => {
  const csp = frameContentSecurityPolicy(['https://app.witnesswork.app'])

  it('runs scripts only from itself and Turnstile', () => {
    expect(directive(csp, 'default-src')).toEqual(["'none'"])
    expect(directive(csp, 'script-src')).toEqual([
      "'self'",
      'https://challenges.cloudflare.com',
    ])
    expect(directive(csp, 'frame-src')).toEqual([
      'https://challenges.cloudflare.com',
    ])
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|\*/)
  })

  it('connects nowhere, and posts no form', () => {
    expect(directive(csp, 'connect-src')).toBeUndefined()
    expect(directive(csp, 'form-action')).toEqual(["'none'"])
    expect(directive(csp, 'base-uri')).toEqual(["'none'"])
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
  })

  it('is framed only by the app', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual([
      'https://app.witnesswork.app',
    ])
    expect(() => frameContentSecurityPolicy([])).toThrow()
    expect(
      directive(
        frameContentSecurityPolicy(['http://localhost:*']),
        'frame-ancestors'
      )
    ).toEqual(['http://localhost:*'])
  })

  it('sends no referrer and allows no powerful feature', () => {
    const headers = frameHeaders(['https://app.witnesswork.app'])
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    for (const feature of [
      'camera',
      'geolocation',
      'microphone',
      'payment',
      'publickey-credentials-get',
    ])
      expect(headers['Permissions-Policy']).toContain(`${feature}=()`)
    expect(Object.keys(headers)).not.toContain('Set-Cookie')

    expect(Object.keys(headers)).not.toContain('X-Frame-Options')
    expect(frameHeadersFile(['https://app.witnesswork.app'])).toMatch(
      /^\/\*\n {2}Content-Security-Policy: default-src 'none';/
    )
  })
})
