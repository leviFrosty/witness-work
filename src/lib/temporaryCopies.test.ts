import { beforeEach, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => ({
  names: [] as string[],
  readFails: false,
  deleted: [] as string[],
}))
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///app/Caches/',
  readDirectoryAsync: vi.fn(async () => {
    if (files.readFails) throw new Error('unreadable')
    return files.names
  }),
  deleteAsync: vi.fn(async (path: string) => {
    if (path.endsWith('locked.witnesswork')) throw new Error('busy')
    files.deleted.push(path)
  }),
}))

import { deleteTemporaryCopies } from '@/lib/temporaryCopies'

beforeEach(() => {
  files.names = []
  files.readFails = false
  files.deleted = []
})

it('deletes exported files and photo working copies, and nothing else', async () => {
  files.names = [
    'witness-work-backup.json',
    'Jane_Example_2026-10-01.witnesswork',
    'ImagePicker',
    'ImageManipulator',
    'buddy-photos',
    'http-cache',
    'Mileage-2026-10-01.csv',
  ]
  await deleteTemporaryCopies()
  expect(files.deleted.sort()).toEqual([
    'file:///app/Caches/ImageManipulator',
    'file:///app/Caches/ImagePicker',
    'file:///app/Caches/Jane_Example_2026-10-01.witnesswork',
    'file:///app/Caches/witness-work-backup.json',
  ])
})

it('never throws when the folder or a file can’t be removed', async () => {
  files.names = ['locked.witnesswork', 'witness-work-backup.json']
  await expect(deleteTemporaryCopies()).resolves.toBeUndefined()
  expect(files.deleted).toEqual(['file:///app/Caches/witness-work-backup.json'])

  files.readFails = true
  await expect(deleteTemporaryCopies()).resolves.toBeUndefined()
})
