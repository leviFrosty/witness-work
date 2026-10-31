import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { TRUSTED_TYPES_POLICIES } from '../../../web/host/src/headers'

const APP = 'https://app.witnesswork.app/contacts'
const CHUNK = '/_expo/static/js/web/es-419-4f2b3c1d0e9a8b7c6d5e4f3a2b1c0d9e.js'

const load = async () => {
  vi.resetModules()
  return import('@/vendor/web/trustedTypes')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the chunk policy', () => {
  it('takes only this origin’s script chunks', async () => {
    const { chunkURL } = await load()
    expect(chunkURL(CHUNK, APP)).toBe(`https://app.witnesswork.app${CHUNK}`)
    expect(chunkURL(`https://app.witnesswork.app${CHUNK}`, APP)).toBe(
      `https://app.witnesswork.app${CHUNK}`
    )
    for (const url of [
      `https://evil.example${CHUNK}`,
      `//evil.example${CHUNK}`,
      `https://app-dev.witnesswork.app${CHUNK}`,
      'data:text/javascript,alert(1)',
      'javascript:alert(1)',
      'blob:https://app.witnesswork.app/0b2c',
      '/assets/evil.js',
      '/_expo/static/js/web/',
      '/_expo/static/js/web/../../../upload.js',
      '/_expo/static/js/web/%2e%2e/upload.js',
      '/_expo/static/js/web/sub/chunk.js',
      `${CHUNK}?callback=x`,
      `${CHUNK}#x`,
      '/_expo/static/js/web/chunk.json',
    ])
      expect(() => chunkURL(url, APP), url).toThrow(TypeError)
  })

  it('has a name the CSP allows, as the note editor’s paste policy does', async () => {
    const { CHUNK_POLICY } = await load()
    expect(TRUSTED_TYPES_POLICIES).toContain(CHUNK_POLICY)
    // ProseMirror names its own; a rename there would break pasting HTML.
    const view = fs.readFileSync(require.resolve('prosemirror-view'), 'utf8')
    expect(view).toContain('createPolicy("ProseMirrorClipboard"')
    expect(TRUSTED_TYPES_POLICIES).toContain('ProseMirrorClipboard')
  })

  it('creates the one named policy, once, and routes chunk URLs through it', async () => {
    const createScriptURL = vi.fn()
    const createPolicy = vi.fn(
      (_name: string, rules: { createScriptURL: (url: string) => string }) => ({
        createScriptURL: (url: string) => {
          createScriptURL(url)
          return { trusted: rules.createScriptURL(url) }
        },
      })
    )
    vi.stubGlobal('trustedTypes', { createPolicy })
    vi.stubGlobal('location', new URL(APP))
    const { CHUNK_POLICY, chunkScriptURL, createChunkPolicy } = await load()
    createChunkPolicy()
    createChunkPolicy()
    expect(createPolicy).toHaveBeenCalledTimes(1)
    expect(createPolicy).toHaveBeenCalledWith(CHUNK_POLICY, expect.anything())
    expect(chunkScriptURL(CHUNK)).toEqual({
      trusted: `https://app.witnesswork.app${CHUNK}`,
    })
    expect(() => chunkScriptURL('https://evil.example/x.js')).toThrow()
  })

  it('still checks the URL where the browser has no Trusted Types', async () => {
    vi.stubGlobal('location', new URL(APP))
    const { chunkScriptURL, createChunkPolicy } = await load()
    createChunkPolicy()
    expect(chunkScriptURL(CHUNK)).toBe(`https://app.witnesswork.app${CHUNK}`)
    expect(() => chunkScriptURL('https://evil.example/x.js')).toThrow()
  })
})
