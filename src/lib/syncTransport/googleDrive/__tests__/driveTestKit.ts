import {
  createFakeGoogleDrive,
  type FakeGoogleDrive,
} from '../../../../../scripts/verify/fakeGoogleDrive'
import {
  createDriveApi,
  type DriveFileTransfer,
} from '@/lib/syncTransport/googleDrive/driveApi'

/** Local files for photo transfers, by path. */
export type MemoryFiles = Map<string, Uint8Array>

/** Photo transfers against the fake, reading and writing `files`. */
export function memoryTransfer(
  drive: FakeGoogleDrive,
  files: MemoryFiles
): DriveFileTransfer {
  return {
    async upload({ url, sourcePath, headers }) {
      const bytes = files.get(sourcePath)
      if (!bytes) throw new Error(`no local file ${sourcePath}`)
      const response = await drive.fetch(url, {
        method: 'PUT',
        headers,
        body: bytes.slice(),
      })
      return { status: response.status, body: await response.text() }
    },
    async download({ url, destinationPath, headers }) {
      const response = await drive.fetch(url, { headers })
      if (response.ok)
        files.set(destinationPath, new Uint8Array(await response.arrayBuffer()))
      return { status: response.status }
    },
  }
}

export function driveKit(options: { maxPageSize?: number } = {}) {
  const drive = createFakeGoogleDrive(options)
  const local: MemoryFiles = new Map()
  const tokens: Array<{ refresh: boolean }> = []
  const api = (account: string) =>
    createDriveApi({
      origin: drive.origin,
      fetch: drive.fetch,
      transfer: memoryTransfer(drive, local),
      sleep: async () => {},
      getToken: async (options) => {
        tokens.push(options)
        return `fake:${account}`
      },
    })
  return { drive, local, tokens, api }
}

export { createFakeGoogleDrive, type FakeGoogleDrive }
