import { describe, expect, it } from 'vitest'
import {
  guestFilesToKeep,
  isChunkRequest,
  isGuestFile,
  isGuestScope,
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

      'https://maps.witnesswork.app/',
      'https://maps-beta.witnesswork.app/frame.js',
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

describe('the guest page’s worker', () => {
  it('is the one registered under the guest path', () => {
    expect(isGuestScope(`${ORIGIN}/territories/guest`)).toBe(true)
    expect(isGuestScope(`${ORIGIN}/territories/guest/`)).toBe(true)
    expect(isGuestScope(`${ORIGIN}/`)).toBe(false)
    expect(isGuestScope(`${ORIGIN}/territories`)).toBe(false)
    expect(isGuestScope('not a url')).toBe(false)
  })

  const HASH = '0123456789abcdef0123456789abcdef'

  it('keeps hashed chunks and assets of this origin', () => {
    for (const path of [
      `/_expo/static/js/web/index-${HASH}.js`,
      `/_expo/static/js/web/__shared-55e8cb29e2f025a1-${HASH}.js`,
      `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.${HASH}.ttf`,
    ])
      expect(isGuestFile(url(path), ORIGIN), path).toBe(true)
  })

  it('keeps no page address, unhashed file, query or other origin', () => {
    for (const target of [
      `${ORIGIN}/territories/guest`,
      `${ORIGIN}/index.html`,
      `${ORIGIN}/sw.js`,
      `${ORIGIN}/canvaskit.wasm`,
      `${ORIGIN}/assets/logo.png`,
      `${ORIGIN}/_expo/static/js/web/index-${HASH}.js?v=1`,
      `https://api.witnesswork.app/assets/a.${HASH}.js`,
    ])
      expect(isGuestFile(new URL(target), ORIGIN), target).toBe(false)
  })

  it('takes only such files from what a page names', () => {
    expect(
      guestFilesToKeep(
        [
          `/_expo/static/js/web/index-${HASH}.js`,
          `${ORIGIN}/_expo/static/js/web/index-${HASH}.js#v1.secret`,
          '/territories/guest',
          `https://elsewhere.example/assets/a.${HASH}.js`,
          42,
        ],
        ORIGIN
      )
    ).toEqual([`/_expo/static/js/web/index-${HASH}.js`])
    expect(guestFilesToKeep('nope', ORIGIN)).toEqual([])
  })
})
