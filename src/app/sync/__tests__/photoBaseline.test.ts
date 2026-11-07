import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhotoReferences } from '@/app/sync/publishedPhotos'

const stored = vi.hoisted(() => new Map<string, string>())
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getString: (key: string) => stored.get(key),
    set: (key: string, value: string) => stored.set(key, value),
    delete: (key: string) => stored.delete(key),
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const refs = (byRecord: Record<string, string[]>, extra: string[] = []) => ({
  byRecord: new Map(
    Object.entries(byRecord).map(([key, names]) => [key, new Set(names)])
  ),
  all: new Set([...Object.values(byRecord).flat(), ...extra]),
})

const launch = async () => {
  vi.resetModules()
  return await import('@/app/sync/photoBaseline')
}

const r1 = 'img-contact-c1--r1.jpg'
const r2 = 'img-contact-c1--r2.jpg'
const withR1 = () => refs({ 'contact:c1': [r1], profile: [] })
const withoutPhoto = () => refs({ 'contact:c1': [], profile: [] })

const publish = (
  baseline: Awaited<ReturnType<typeof launch>>,
  references: PhotoReferences,
  identity: string | null = 'account:a'
) =>
  baseline.takeReplacedPhotos(
    identity,
    references,
    baseline.publishedPhotosMark(),
    () => references
  )

describe('the published photos baseline', () => {
  beforeEach(() => stored.clear())

  it('deletes a removed photo on the publish after a kill', async () => {
    const first = await launch()
    expect(publish(first, withR1())).toEqual([])
    const second = await launch()
    expect(publish(second, withoutPhoto())).toEqual([r1])

    const third = await launch()
    expect(publish(third, withoutPhoto())).toEqual([])
  })

  it('never deletes a photo something still refers to', async () => {
    const first = await launch()
    publish(first, withR1())
    const second = await launch()
    expect(
      publish(second, refs({ 'contact:c1': [], 'contact:c2': [r1] }))
    ).toEqual([])
    const third = await launch()
    publish(third, withR1())
    const fourth = await launch()

    expect(publish(fourth, refs({ 'contact:c1': [] }, [r1]))).toEqual([])
  })

  it('takes a rebase made after a kill, before any publish, as the baseline', async () => {
    const first = await launch()
    publish(first, withR1())
    const second = await launch()
    second.setPhotoReferenceReader(withoutPhoto)

    second.rebasePublishedPhotos()
    expect(publish(second, withoutPhoto())).toEqual([])
    const third = await launch()
    expect(publish(third, withoutPhoto())).toEqual([])
  })

  it('drops the baseline of a rebase it can’t read the references for', async () => {
    const first = await launch()
    publish(first, withR1())
    const second = await launch()
    second.rebasePublishedPhotos()
    const third = await launch()
    expect(publish(third, withoutPhoto())).toEqual([])
  })

  it('ignores a baseline from another account', async () => {
    const first = await launch()
    publish(first, withR1(), 'account:a')
    const second = await launch()
    expect(publish(second, withoutPhoto(), 'account:b')).toEqual([])
  })

  it('forgets everything on clear', async () => {
    const first = await launch()
    publish(first, withR1())
    first.clearPublishedPhotos()
    expect(publish(first, withoutPhoto())).toEqual([])
    const second = await launch()
    publish(second, withR1())
    second.clearPublishedPhotos()
    const third = await launch()
    expect(publish(third, withoutPhoto())).toEqual([])
  })

  it('starts empty from an unreadable save', async () => {
    stored.set('cloudSync.publishedPhotos', '{not json')
    const first = await launch()
    expect(publish(first, withoutPhoto())).toEqual([])
    stored.set('cloudSync.publishedPhotos', JSON.stringify({ identity: 3 }))
    const second = await launch()
    expect(publish(second, withoutPhoto())).toEqual([])
  })

  it('moves a record’s photo to its new revision', async () => {
    const first = await launch()
    publish(first, refs({ 'contact:c1': [r1] }))
    const second = await launch()
    expect(publish(second, refs({ 'contact:c1': [r2] }))).toEqual([r1])
  })

  describe('deletes still waiting', () => {
    it('stay until they’re done, across kills', async () => {
      const first = await launch()
      publish(first, withR1())
      expect(publish(first, withoutPhoto())).toEqual([r1])
      expect(first.pendingPhotoDeletes('account:a')).toEqual([r1])
      const second = await launch()
      expect(second.pendingPhotoDeletes('account:a')).toEqual([r1])

      expect(publish(second, refs({ 'contact:c2': [r2] }))).toEqual([])
      expect(publish(second, refs({ 'contact:c2': [] }))).toEqual([r2])
      expect(second.pendingPhotoDeletes('account:a').sort()).toEqual([r1, r2])
      second.photoDeletesDone([r1])
      const third = await launch()
      expect(third.pendingPhotoDeletes('account:a')).toEqual([r2])
      third.photoDeletesDone([r2])
      const fourth = await launch()
      expect(fourth.pendingPhotoDeletes('account:a')).toEqual([])
    })

    it('survive a rebase', async () => {
      const first = await launch()
      publish(first, withR1())
      publish(first, withoutPhoto())
      const second = await launch()
      second.setPhotoReferenceReader(withoutPhoto)
      second.rebasePublishedPhotos()
      expect(second.pendingPhotoDeletes('account:a')).toEqual([r1])

      const third = await launch()
      third.rebasePublishedPhotos()
      expect(third.pendingPhotoDeletes('account:a')).toEqual([r1])
    })

    it('belong to their account and go with a clear', async () => {
      const first = await launch()
      publish(first, withR1())
      publish(first, withoutPhoto())
      expect(first.pendingPhotoDeletes('account:b')).toEqual([])

      publish(first, withoutPhoto(), 'account:b')
      expect(first.pendingPhotoDeletes('account:a')).toEqual([])
      publish(first, withR1(), 'account:b')
      publish(first, withoutPhoto(), 'account:b')
      first.clearPublishedPhotos()
      const second = await launch()
      expect(second.pendingPhotoDeletes('account:b')).toEqual([])
    })
  })
})
