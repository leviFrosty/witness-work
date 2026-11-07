import type { PhotoFiles } from '@/lib/syncTransport/server/serverTransport'

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
