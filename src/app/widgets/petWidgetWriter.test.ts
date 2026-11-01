import { describe, expect, it, vi } from 'vitest'
import type {
  PetWidgetBuild,
  PetWidgetPlan,
  PetWidgetSnapshot,
} from '@/app/widgets/petWidget'
import {
  createPetWidgetWriter,
  PET_RETRY_MS,
  PET_WRITTEN_KEY,
} from '@/app/widgets/petWidgetWriter'

const plan = (hash: string) => ({ hash }) as PetWidgetPlan

const snapshotNaming = (files: string[]) =>
  ({
    name: 'Biscuit',
    entries: files.map((small, i) => ({ date: i, small })),
  }) as unknown as PetWidgetSnapshot

const buildOf =
  (byHash: Record<string, string[]>) =>
  (planned: PetWidgetPlan): PetWidgetBuild => {
    const names = byHash[planned.hash].map((n) => `pet-${n}.png`)
    return {
      snapshot: snapshotNaming(names),
      files: names.map((name) => ({ name, base64: 'AAAA' })),
      hash: planned.hash,
    }
  }

function setup(byHash: Record<string, string[]>) {
  const store = new Map<string, string>()
  let clock = 1_000_000
  const disk = new Set<string>()
  const bridge = {
    writeFile: vi.fn(async (name: string) => {
      disk.add(name)
    }),
    pruneFiles: vi.fn(async (keep: string[]) => {
      for (const name of [...disk]) if (!keep.includes(name)) disk.delete(name)
    }),
  }
  const render = vi.fn(buildOf(byHash))
  const onError = vi.fn()
  const deps = {
    storage: {
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => void store.set(key, value),
    },
    bridge,
    render,
    onError,
    now: () => clock,
  }
  return {
    writer: createPetWidgetWriter(deps),

    restart: () => createPetWidgetWriter(deps),
    store,
    disk,
    bridge,
    render,
    onError,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe('petWidgetWriter', () => {
  it('keeps the previous snapshot’s images until the one after', async () => {
    const t = setup({ a: ['1', '2'], b: ['2', '3'], c: ['4'] })
    const first = await t.writer.prepare(() => plan('a'))
    expect(first).toMatchObject({
      fresh: true,
      files: ['pet-1.png', 'pet-2.png'],
    })
    await t.writer.written(first)
    const second = await t.writer.prepare(() => plan('b'))
    await t.writer.written(second)

    expect([...t.disk].sort()).toEqual(['pet-1.png', 'pet-2.png', 'pet-3.png'])
    const third = await t.writer.prepare(() => plan('c'))
    await t.writer.written(third)
    expect([...t.disk].sort()).toEqual(['pet-2.png', 'pet-3.png', 'pet-4.png'])
  })

  it('draws nothing when the inputs are the ones written, even in a new process', async () => {
    const t = setup({ a: ['1'] })
    await t.writer.written(await t.writer.prepare(() => plan('a')))
    const again = await t.restart().prepare(() => plan('a'))
    expect(t.render).toHaveBeenCalledTimes(1)
    expect(again).toMatchObject({
      fresh: false,
      hash: 'a',
      files: ['pet-1.png'],
    })
    expect(again.snapshot?.name).toBe('Biscuit')
  })

  it('keeps the slice on disk when a build fails, and waits before retrying', async () => {
    const t = setup({ a: ['1'] })
    await t.writer.written(await t.writer.prepare(() => plan('a')))
    t.render.mockImplementation(() => {
      throw new Error('no Skia')
    })
    const fresh = t.restart()
    const failed = await fresh.prepare(() => plan('b'))

    expect(failed).toMatchObject({
      fresh: false,
      hash: 'a',
      files: ['pet-1.png'],
    })
    expect(t.onError).toHaveBeenCalledTimes(1)
    await fresh.prepare(() => plan('b'))
    expect(t.render).toHaveBeenCalledTimes(2)
    t.advance(PET_RETRY_MS)
    await fresh.prepare(() => plan('b'))
    expect(t.render).toHaveBeenCalledTimes(3)
  })

  it('keeps the slice on disk when the plan itself fails', async () => {
    const t = setup({ a: ['1'] })
    await t.writer.written(await t.writer.prepare(() => plan('a')))
    const kept = await t.writer.prepare(() => {
      throw new Error('bad record')
    })
    expect(kept).toMatchObject({ hash: 'a', files: ['pet-1.png'] })
  })

  it('writes no snapshot naming an image that failed to write', async () => {
    const t = setup({ a: ['1'], b: ['2', '3'] })
    await t.writer.written(await t.writer.prepare(() => plan('a')))
    t.bridge.writeFile.mockImplementationOnce(async () => {
      throw new Error('disk full')
    })
    const failed = await t.writer.prepare(() => plan('b'))
    expect(failed).toMatchObject({ hash: 'a', files: ['pet-1.png'] })

    t.advance(PET_RETRY_MS)
    const retried = await t.writer.prepare(() => plan('b'))
    expect(retried.fresh).toBe(true)
    expect(t.bridge.writeFile.mock.calls.map(([name]) => name)).toEqual([
      'pet-1.png',
      'pet-2.png',
      'pet-3.png',
      'pet-2.png',
    ])
  })

  it('writes every image again after a prune fails', async () => {
    const t = setup({ a: ['1'], a2: ['1'], b: ['1', '2'] })
    await t.writer.written(await t.writer.prepare(() => plan('a')))
    t.bridge.pruneFiles.mockRejectedValueOnce(new Error('busy'))
    await t.writer.written(await t.writer.prepare(() => plan('a2')))
    expect(t.onError).toHaveBeenCalled()
    t.bridge.writeFile.mockClear()
    await t.writer.prepare(() => plan('b'))
    expect(t.bridge.writeFile.mock.calls.map(([name]) => name)).toEqual([
      'pet-1.png',
      'pet-2.png',
    ])
  })

  it('remembers new inputs that came out as the same slice', async () => {
    const t = setup({ a: ['1'], b: ['1'] })
    await t.writer.written(await t.writer.prepare(() => plan('a')))
    t.writer.unchanged(await t.writer.prepare(() => plan('b')))
    expect(JSON.parse(t.store.get(PET_WRITTEN_KEY)!).hash).toBe('b')
    await t.restart().prepare(() => plan('b'))
    expect(t.render).toHaveBeenCalledTimes(2)
  })

  it('names no images without a pet, and prunes them after the next write', async () => {
    const t = setup({ a: ['1'] })
    await t.writer.written(await t.writer.prepare(() => plan('a')))
    const none = await t.writer.prepare(() => null)
    expect(none).toMatchObject({ snapshot: null, files: [] })
    await t.writer.written(none)
    expect([...t.disk]).toEqual(['pet-1.png'])
    await t.writer.written(await t.writer.prepare(() => null))
    expect([...t.disk]).toEqual([])
  })
})
