import { afterEach, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }))
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: null }))

import { listNoteImageFiles } from '@/lib/richText/noteImages'
import { webPhotos } from '@/lib/files/webPhotoStore'

afterEach(() => {
  for (const { id } of webPhotos.list()) webPhotos.delete(id)
  vi.unstubAllGlobals()
})

it('lists only note photos from the browser’s photo store, never avatars', async () => {
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:x',
    revokeObjectURL: () => {},
  })
  const photo = () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' })
  webPhotos.put('photo-0001', photo())
  webPhotos.put('avatars/profile-avatar-synced-p1.jpg', photo())
  webPhotos.put('avatars/contact-c1-avatar-picked-r1.jpg', photo())

  expect((await listNoteImageFiles()).map((file) => file.id)).toEqual([
    'photo-0001',
  ])
})
