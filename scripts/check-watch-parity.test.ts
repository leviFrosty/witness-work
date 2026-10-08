import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkRegistry, REGISTRY } from './check-watch-parity.mjs'

describe('watch parity registry', () => {
  it('describes every watch feature on both watches', () => {
    const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
    expect(checkRegistry(registry)).toEqual([])
  })
})

describe('checkRegistry', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'ww-watch-parity-'))
    await mkdir(path.join(root, 'ios'))
    await mkdir(path.join(root, 'wear/ui'), { recursive: true })
    await writeFile(path.join(root, 'ios/Home.swift'), 'struct HomeView {}')
    await writeFile(path.join(root, 'wear/ui/Home.kt'), 'fun HomeScreen() {}')
  })

  afterEach(() => rm(root, { recursive: true, force: true }))

  const registry = (feature: Record<string, unknown> = {}) => ({
    sources: { watchos: ['ios/*.swift'], wearos: ['wear/**/*.kt'] },
    features: [
      {
        id: 'home.screen',
        area: 'Home',
        title: 'Home',
        description: 'The first screen.',
        watchos: {
          status: 'implemented',
          paths: ['ios/Home.swift#HomeView'],
        },
        wearos: {
          status: 'implemented',
          paths: ['wear/ui/Home.kt#HomeScreen'],
        },
        ...feature,
      },
    ],
  })

  it('passes a complete registry', () => {
    expect(checkRegistry(registry(), root)).toEqual([])
  })

  it('needs both watches', () => {
    expect(checkRegistry(registry({ wearos: undefined }), root)).toEqual([
      "home.screen (wearos): missing; say how it's implemented or why not",
      "wear/ui/Home.kt (wearos) isn't part of any feature in docs/watch/features.json; add it to the features it implements, or to infrastructure",
    ])
  })

  it('needs the paths of an implementation, and notes for anything less', () => {
    expect(
      checkRegistry(
        registry({
          watchos: { status: 'implemented', paths: [] },
          wearos: { status: 'gap', paths: ['wear/ui/Home.kt'] },
        }),
        root
      )
    ).toEqual([
      'home.screen (watchos): implemented needs the paths that implement it',
      'home.screen (wearos): gap needs notes saying why',
      "ios/Home.swift (watchos) isn't part of any feature in docs/watch/features.json; add it to the features it implements, or to infrastructure",
    ])
  })

  it('catches a moved file or a renamed symbol', () => {
    expect(
      checkRegistry(
        registry({
          watchos: {
            status: 'implemented',
            paths: ['ios/Home.swift#OldHomeView', 'ios/Gone.swift'],
          },
        }),
        root
      )
    ).toEqual([
      'home.screen (watchos): ios/Home.swift no longer contains "OldHomeView"',
      "home.screen (watchos): ios/Gone.swift doesn't exist",
    ])
  })

  it('catches a new source file no feature mentions', async () => {
    await writeFile(path.join(root, 'wear/ui/Settings.kt'), 'fun Settings() {}')
    expect(checkRegistry(registry(), root)).toEqual([
      "wear/ui/Settings.kt (wearos) isn't part of any feature in docs/watch/features.json; add it to the features it implements, or to infrastructure",
    ])
  })

  it('rejects unknown statuses and duplicate ids', () => {
    const twice = registry({
      wearos: { status: 'done', paths: ['wear/ui/Home.kt'] },
    })
    twice.features.push(twice.features[0])
    expect(checkRegistry(twice, root)).toEqual([
      'home.screen (wearos): status must be one of implemented, partial, gap, not-applicable, not "done"',
      'home.screen: id is used twice',
      'home.screen (wearos): status must be one of implemented, partial, gap, not-applicable, not "done"',
    ])
  })
})
