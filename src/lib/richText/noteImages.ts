import * as FileSystem from 'expo-file-system/legacy'
import { isImageId } from '@/lib/richText/parse'

const DIRECTORY = 'note-images/'
export const MAX_NOTE_IMAGES = 10

export const noteImageDirectory = () =>
  `${FileSystem.documentDirectory}${DIRECTORY}`

export function noteImagePath(id: string): string {
  if (!isImageId(id)) throw new Error('Invalid note image id')
  return `${noteImageDirectory()}${id}.jpg`
}

export function noteImageFileId(fileName: string): string | undefined {
  const match = /^([A-Za-z0-9-]{8,64})\.jpg$/.exec(fileName)
  return match?.[1]
}

const knownLocal = new Set<string>()
export const isNoteImageKnownLocal = (id: string) => knownLocal.has(id)
export function markNoteImagesLocal(ids: Iterable<string>) {
  for (const id of ids) knownLocal.add(id)
}

let ensured: Promise<void> | undefined

export function ensureNoteImageDirectory(): Promise<void> {
  ensured ??= FileSystem.makeDirectoryAsync(noteImageDirectory(), {
    intermediates: true,
  }).catch((error: unknown) => {
    ensured = undefined
    throw error
  })
  return ensured
}

export async function noteImageExists(id: string): Promise<boolean> {
  if (!isImageId(id)) return false
  const info = await FileSystem.getInfoAsync(noteImagePath(id))
  return info.exists
}

export async function deleteNoteImages(ids: Iterable<string>): Promise<void> {
  await Promise.all(
    [...ids].filter(isImageId).map((id) => {
      knownLocal.delete(id)
      return FileSystem.deleteAsync(noteImagePath(id), {
        idempotent: true,
      }).catch(() => {})
    })
  )
}

export async function listNoteImageFiles(): Promise<
  { id: string; modifiedAt: number }[]
> {
  const directory = noteImageDirectory()
  const info = await FileSystem.getInfoAsync(directory)
  if (!info.exists) return []
  const names = await FileSystem.readDirectoryAsync(directory)
  const files = await Promise.all(
    names.map(async (name) => {
      const id = noteImageFileId(name)
      if (!id) return null
      const file = await FileSystem.getInfoAsync(`${directory}${name}`)
      return file.exists
        ? { id, modifiedAt: Math.round((file.modificationTime ?? 0) * 1000) }
        : null
    })
  )
  return files.filter((file) => file !== null)
}
