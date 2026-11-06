import { describe, expect, it } from 'vitest'
import {
  isChunkRequest,
  isNeverCached,
  isOnDemandFile,
  isStorableFile,
  isUsableNavigation,
} from './rules'

const ORIGIN = 'https://app.witnesswork.app'
const url = (path: string) => new URL(path, ORIGIN)
const response = (status: number, type?: string) => ({
  status,
  headers: { get: () => type ?? null },
})

describe('what the service worker never caches', () => {
  it('leaves other origins, the report endpoint, well-known files and itself alone', () => {
    for (const target of [
      'https://api.witnesswork.app/accounts/v1/sync',
      'https://ww-api-r.leviwilkerson.com/e',
      'https://witnesswork.app/help/bundle/manifest.json',
      // The maps frame's own origins (ADR 0037 §8).
      'https://maps.witnesswork.app/',
      'https://maps-dev.witnesswork.app/frame.js',
      `${ORIGIN}/_csp-report`,
      `${ORIGIN}/.well-known/webauthn`,
      `${ORIGIN}/.well-known/apple-app-site-association`,
      `${ORIGIN}/sw.js`,
    ])
      expect(isNeverCached(new URL(target), ORIGIN), target).toBe(true)
    expect(isNeverCached(url('/_expo/static/js/web/es-ES-a.js'), ORIGIN)).toBe(
      false
    )
  })

  it('takes lazy chunks of this origin only', () => {
    expect(isChunkRequest(url('/_expo/static/js/web/es-ES-a.js'), ORIGIN)).toBe(
      true
    )
    expect(isChunkRequest(url('/_expo/static/js/web/a.json'), ORIGIN)).toBe(
      false
    )
    expect(isChunkRequest(url('/assets/a.js'), ORIGIN)).toBe(false)
    expect(
      isChunkRequest(
        new URL('https://evil.example/_expo/static/js/web/a.js'),
        ORIGIN
      )
    ).toBe(false)
  })

  it('keeps the wasm files at the root once loaded, not other origins’', () => {
    expect(isOnDemandFile(url('/canvaskit.wasm'), ORIGIN)).toBe(true)
    expect(isOnDemandFile(url('/sql-wasm-browser.wasm'), ORIGIN)).toBe(true)
    expect(isOnDemandFile(url('/assets/a.wasm'), ORIGIN)).toBe(false)
    expect(isOnDemandFile(url('/canvaskit.js'), ORIGIN)).toBe(false)
    expect(
      isOnDemandFile(new URL('https://evil.example/canvaskit.wasm'), ORIGIN)
    ).toBe(false)
  })

  it('never stores a page or an error under a file’s URL', () => {
    expect(
      isStorableFile(response(200, 'text/javascript; charset=utf-8'))
    ).toBe(true)
    expect(isStorableFile(response(200, 'text/html; charset=utf-8'))).toBe(
      false
    )
    expect(isStorableFile(response(404, 'text/plain'))).toBe(false)
    expect(isStorableFile(response(206))).toBe(false)
  })

  it('shows a page unless the server failed', () => {
    expect(isUsableNavigation(response(200))).toBe(true)
    expect(isUsableNavigation(response(404))).toBe(true)
    expect(isUsableNavigation(response(503))).toBe(false)
  })
})
