import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMBEDDING_MODEL } from '../src/embed'
import { INDEX_VERSION, type StoredIndex } from '../src/searchIndex'
import { hashEntry, runSync, withRetry } from '../src/sync'
import { bundle, entry } from './fixtures/bundle'
import { mockAi, mockKv } from './mocks'

describe('runSync', () => {
  let ai: ReturnType<typeof mockAi>
  let kv: ReturnType<typeof mockKv>
  const env = () => ({ AI: ai.ai, SYNC_STATE: kv.kv })
  const stored = (locale = 'en-US'): StoredIndex =>
    JSON.parse(kv.store.get(`index:${locale}`)!)
  const embeddedTexts = () =>
    ai.run.mock.calls.flatMap(([, input]) => input.text)

  beforeEach(() => {
    ai = mockAi()
    kv = mockKv()
  })

  it('indexes every entry of a new bundle', async () => {
    const summary = await runSync(env(), { bundles: [bundle()] })
    expect(summary).toEqual({
      locales: {
        'en-US': { status: 'synced', embedded: 3, reused: 0, remaining: 0 },
      },
      remaining: 0,
    })
    const index = stored()
    expect(index).toMatchObject({
      version: INDEX_VERSION,
      model: EMBEDDING_MODEL,
      bundleHash: 'aaaa',
    })
    expect(index.entries.map((e) => e.slug)).toEqual([
      'time-rollover',
      'i-cloud-sync',
      'notes-photos',
    ])
    expect(index.entries[1]).toMatchObject({
      ios: true,
      android: false,
      web: false,
      minAppVersion: 0,
    })
    expect(index.entries[0]).toMatchObject({
      ios: true,
      android: true,
      web: true,
    })
    expect(index.entries[2].minAppVersion).toBe(4_012_000)
    expect(index.entries[0].terms).toMatchObject({ partial: 2, hour: 2 })
    expect(embeddedTexts()[0]).toBe(
      'title: Can partial hours carry over to the next month? | text: Yes. Partial hours below your monthly goal can carry over.'
    )
  })

  it('skips a locale whose bundle hash is unchanged', async () => {
    await runSync(env(), { bundles: [bundle()] })
    ai.run.mockClear()
    const summary = await runSync(env(), { bundles: [bundle()] })
    expect(summary.locales['en-US'].status).toBe('unchanged')
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('embeds only new and changed entries', async () => {
    await runSync(env(), { bundles: [bundle()] })
    ai.run.mockClear()
    const changed = bundle(
      [
        entry(),
        entry({ slug: 'notes-photos', plainText: 'Tap the camera.' }),
        entry({ slug: 'added', question: 'A new question?' }),
      ],
      { hash: 'bbbb' }
    )
    const summary = await runSync(env(), { bundles: [changed] })
    expect(summary.locales['en-US']).toMatchObject({
      status: 'synced',
      embedded: 2,
      reused: 1,
    })
    expect(stored().entries.map((e) => e.slug)).toEqual([
      'time-rollover',
      'notes-photos',
      'added',
    ])
    expect(stored().bundleHash).toBe('bbbb')
  })

  it('rebuilds on force without re-embedding', async () => {
    await runSync(env(), { bundles: [bundle()] })
    ai.run.mockClear()
    const summary = await runSync(env(), { bundles: [bundle()], force: true })
    expect(summary.locales['en-US']).toMatchObject({
      status: 'synced',
      embedded: 0,
      reused: 3,
    })
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('rebuilds an index from an older index version without re-embedding', async () => {
    await runSync(env(), { bundles: [bundle()] })
    const index = stored() as unknown as Record<string, unknown>
    index.version = 1
    kv.store.set('index:en-US', JSON.stringify(index))
    ai.run.mockClear()
    const summary = await runSync(env(), { bundles: [bundle()] })
    expect(summary.locales['en-US']).toMatchObject({
      status: 'synced',
      embedded: 0,
    })
    expect(stored().version).toBe(INDEX_VERSION)
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('re-embeds an index built with another model', async () => {
    await runSync(env(), { bundles: [bundle()] })
    const index = stored()
    index.model = '@cf/old/model'
    index.entries.forEach((e) => (e.hash = 'old'))
    kv.store.set('index:en-US', JSON.stringify(index))
    const summary = await runSync(env(), { bundles: [bundle()] })
    expect(summary.locales['en-US']).toMatchObject({ embedded: 3 })
    expect(stored().model).toBe(EMBEDDING_MODEL)
  })

  it('shares English embeddings with untranslated entries', async () => {
    const spanish = bundle(
      [
        entry({ question: '¿Puedo pasar horas?', plainText: 'Sí.' }),
        { ...bundle().entries[1], fallback: true },
        { ...bundle().entries[2], fallback: true },
      ],
      { locale: 'es-ES', hash: 'cccc' }
    )
    const summary = await runSync(env(), { bundles: [bundle(), spanish] })
    expect(summary.locales['es-ES']).toMatchObject({
      embedded: 1,
      reused: 2,
    })
    expect(stored('es-ES').entries[1].vector).toBe(stored().entries[1].vector)
  })

  it('defers a locale past the budget, but always builds the first', async () => {
    const spanish = bundle(undefined, { locale: 'es-ES', hash: 'cccc' })
    spanish.entries = spanish.entries.map((e) => ({
      ...e,
      plainText: `${e.plainText} (es)`,
    }))
    const summary = await runSync(env(), {
      bundles: [bundle(), spanish],
      budget: 2,
    })
    expect(summary.locales['en-US'].status).toBe('synced')
    expect(summary.locales['es-ES']).toMatchObject({
      status: 'deferred',
      remaining: 3,
    })
    expect(summary.remaining).toBe(3)
    expect(kv.store.has('index:es-ES')).toBe(false)
  })

  it('embeds in batches', async () => {
    const entries = Array.from({ length: 45 }, (_, i) =>
      entry({ slug: `a-${i}`, question: `Question ${i}?` })
    )
    await runSync(env(), { bundles: [bundle(entries)] })
    expect(ai.run.mock.calls.map(([, input]) => input.text.length)).toEqual([
      20, 20, 5,
    ])
  })

  it('keeps the old index when embedding fails', async () => {
    await runSync(env(), { bundles: [bundle()] })
    ai.run.mockRejectedValueOnce(new Error('model unavailable'))
    const summary = await runSync(env(), {
      bundles: [bundle([entry({ plainText: 'Changed.' })], { hash: 'bbbb' })],
    })
    expect(summary.locales['en-US']).toMatchObject({
      status: 'error',
      error: 'model unavailable',
    })
    expect(stored().bundleHash).toBe('aaaa')
  })

  it('rejects an invalid bundle without touching the index', async () => {
    const summary = await runSync(env(), {
      bundles: [bundle([entry(), entry()])],
    })
    expect(summary.locales['en-US']).toMatchObject({
      status: 'error',
      error: 'duplicate slugs',
    })
    expect(kv.store.size).toBe(0)
  })

  it('rejects an unknown locale', async () => {
    const summary = await runSync(env(), {
      bundles: [bundle(undefined, { locale: 'xx-XX' })],
    })
    expect(summary.locales['xx-XX']).toMatchObject({
      status: 'error',
      error: 'unknown locale',
    })
  })

  it('pulls the manifest and bundles from the origin, English first', async () => {
    const spanish = bundle(undefined, { locale: 'es-ES', hash: 'cccc' })
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json'))
        return Response.json({
          schemaVersion: 1,
          generatedAt: '',
          locales: {
            'es-ES': {
              hash: 'cccc',
              count: 3,
              path: '/help/bundle/es-ES.json',
            },
            'en-US': {
              hash: 'aaaa',
              count: 3,
              path: '/help/bundle/en-US.json',
            },
          },
        })
      if (url.endsWith('/bundle/en-US.json')) return Response.json(bundle())
      if (url.endsWith('/bundle/es-ES.json')) return Response.json(spanish)
      return new Response('nope', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const summary = await runSync(env(), { origin: 'https://site.test' })
    vi.unstubAllGlobals()
    expect(Object.keys(summary.locales)).toEqual(['en-US', 'es-ES'])
    expect(summary.locales['es-ES']).toMatchObject({
      status: 'synced',
      embedded: 0,
      reused: 3,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://site.test/help/bundle/manifest.json',
      expect.anything()
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://site.test/help/bundle/es-ES.json',
      expect.anything()
    )
  })

  it('follows absolute bundle URLs in the manifest as they are', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://site.test/help/bundle/manifest.json')
        return Response.json({
          schemaVersion: 1,
          generatedAt: '',
          locales: {
            'en-US': {
              hash: 'aaaa',
              count: 3,
              path: 'https://witnesswork.app/help/bundle/en-US.json',
            },
          },
        })
      if (url === 'https://witnesswork.app/help/bundle/en-US.json')
        return Response.json(bundle())
      return new Response('nope', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const summary = await runSync(env(), { origin: 'https://site.test' })
    vi.unstubAllGlobals()
    expect(summary.locales['en-US']).toMatchObject({ status: 'synced' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://witnesswork.app/help/bundle/en-US.json',
      expect.anything()
    )
  })
})

describe('hashEntry', () => {
  it('changes with the embedded text only', async () => {
    const base = await hashEntry(entry())
    expect(await hashEntry(entry({ category: 'other', pinned: false }))).toBe(
      base
    )
    expect(await hashEntry(entry({ plainText: 'Different.' }))).not.toBe(base)
  })
})

describe('withRetry', () => {
  it('retries rate-limit errors with backoff', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('You are being rate limited.'))
      .mockResolvedValueOnce('ok')
    await expect(withRetry(run, { delayMs: 1 })).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(2)
  })
  it('gives up on other errors at once', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(withRetry(run, { delayMs: 1 })).rejects.toThrow('boom')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
