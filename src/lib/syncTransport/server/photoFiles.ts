import type { PhotoFiles } from '@/lib/syncTransport/server/serverTransport'

/**
 * Cloud Sync's photo files as bytes, in native code: no base64 round trip for a
 * photo of up to 25 MiB. A download lands beside its file and moves over it
 * whole, so a failed one never leaves part of a photo where the app looks.
 * `expo-file-system`'s `File` loads on first use, so modules that only wire the
 * transport don't need its native module.
 */
const fileSystem = () => import('expo-file-system')

export const photoFiles: PhotoFiles = {
  async size(path) {
    const { File } = await fileSystem()
    return new File(path).size ?? 0
  },
  async read(path) {
    const { File } = await fileSystem()
    return new File(path).bytes()
  },
  async write(path, bytes) {
    const { File } = await fileSystem()
    const part = new File(`${path}.part`)
    try {
      await part.write(bytes)
      await part.move(new File(path), { overwrite: true })
    } catch (error) {
      if (part.exists) part.delete()
      throw error
    }
  },
}
