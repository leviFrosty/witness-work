import { describe, expect, it } from 'vitest'
import environments from '../../../config/web-environments.json'
import {
  appOriginsFor,
  FRAME_ENVIRONMENTS,
  frameContentSecurityPolicy,
  frameHeaders,
} from './headers'

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `))
    ?.split(' ')
    .slice(1)

describe('the frame environments', () => {
  it('match the app profiles’ maps origins', () => {
    const origins = new Set(
      Object.values(environments).map((profile) => profile.mapsOrigin)
    )
    expect(
      new Set(Object.values(FRAME_ENVIRONMENTS).map((env) => env.origin))
    ).toEqual(origins)
  })

  it('let only their own environments’ apps frame them', () => {
    expect(appOriginsFor(FRAME_ENVIRONMENTS.dev!.origin, environments)).toEqual(
      [
        'http://localhost:*',
        'http://127.0.0.1:*',
        'https://app-dev.witnesswork.app',
      ]
    )
    expect(
      appOriginsFor(FRAME_ENVIRONMENTS.production!.origin, environments)
    ).toEqual([
      'https://beta.app.witnesswork.app',
      'https://app.witnesswork.app',
    ])
  })
})

describe('the frame CSP', () => {
  const csp = frameContentSecurityPolicy(['https://app.witnesswork.app'])

  it('runs scripts only from itself and Apple’s MapKit JS CDN', () => {
    expect(directive(csp, 'default-src')).toEqual(["'none'"])
    expect(directive(csp, 'script-src')).toEqual([
      "'self'",
      'https://cdn.apple-mapkit.com',
    ])
    expect(csp).not.toContain('unsafe-eval')
  })

  it('is framed only by the app', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual([
      'https://app.witnesswork.app',
    ])
    expect(() => frameContentSecurityPolicy([])).toThrow()
  })

  it('sends no referrer and asks for no location', () => {
    const headers = frameHeaders(['https://app.witnesswork.app'])
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['Permissions-Policy']).toContain('geolocation=()')
    expect(Object.keys(headers)).not.toContain('Set-Cookie')
    expect(Object.keys(headers)).not.toContain('X-Frame-Options')
  })
})
