import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pickFiles: vi.fn<(options: unknown) => Promise<File[]>>(),
  readImageSize: vi.fn(),
}))
vi.mock('@/lib/files/pickFiles', () => ({ pickFiles: mocks.pickFiles }))
vi.mock('@/lib/files/webImages', async () => {
  class UnsupportedImageError extends Error {
    constructor(readonly reason: 'unsupported' | 'tooLarge') {
      super(reason)
    }
  }
  return { readImageSize: mocks.readImageSize, UnsupportedImageError }
})

import { MAX_PHOTO_BYTES } from '@/lib/files/imageSizing'
import { pickWebImages } from '@/lib/files/pickWebImages'

const file = (name: string, type = 'image/jpeg', size = 10) =>
  Object.assign(new Blob([new Uint8Array(size)], { type }), {
    name,
    lastModified: 0,
  }) as File

describe('pickWebImages', () => {
  beforeEach(() => {
    mocks.pickFiles.mockReset()
    mocks.readImageSize.mockReset()
    mocks.readImageSize.mockResolvedValue({ width: 800, height: 600 })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:http://localhost/1' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is cancelled when the chooser closes without a file', async () => {
    mocks.pickFiles.mockResolvedValue([])
    await expect(pickWebImages({})).resolves.toEqual({
      canceled: true,
      assets: null,
    })
  })

  it('returns the picker shape with the browser file attached', async () => {
    const photo = file('house.jpg', 'image/jpeg', 2048)
    mocks.pickFiles.mockResolvedValue([photo])
    const result = await pickWebImages({})
    expect(result).toMatchObject({
      canceled: false,
      assets: [
        {
          uri: 'blob:http://localhost/1',
          width: 800,
          height: 600,
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: 'house.jpg',
          fileSize: 2048,
          file: photo,
        },
      ],
    })
    expect(mocks.pickFiles).toHaveBeenCalledWith({
      accept: 'image/*',
      multiple: false,
      capture: undefined,
    })
  })

  it('opens the camera on request, one photo at a time', async () => {
    mocks.pickFiles.mockResolvedValue([file('a.jpg'), file('b.jpg')])
    const result = await pickWebImages(
      { allowsMultipleSelection: true },
      'camera'
    )
    expect(mocks.pickFiles).toHaveBeenCalledWith(
      expect.objectContaining({ capture: 'environment', multiple: false })
    )
    expect(result.canceled === false && result.assets).toHaveLength(1)
  })

  it('keeps to the selection limit', async () => {
    mocks.pickFiles.mockResolvedValue([
      file('a.jpg'),
      file('b.jpg'),
      file('c.jpg'),
    ])
    const result = await pickWebImages({
      allowsMultipleSelection: true,
      selectionLimit: 2,
    })
    expect(result.canceled === false && result.assets).toHaveLength(2)
  })

  it('skips files the browser cannot open when others are fine', async () => {
    mocks.pickFiles.mockResolvedValue([
      file('notes.pdf', 'application/pdf'),
      file('ok.jpg'),
    ])
    mocks.readImageSize.mockImplementationOnce(async () => {
      throw new Error('unsupported')
    })
    const result = await pickWebImages({ allowsMultipleSelection: true })
    expect(
      result.canceled === false && result.assets.map((a) => a.fileName)
    ).toEqual(['ok.jpg'])
  })

  it('throws when nothing picked is a usable photo', async () => {
    mocks.pickFiles.mockResolvedValue([file('notes.pdf', 'application/pdf')])
    mocks.readImageSize.mockRejectedValue(new Error('unsupported'))
    await expect(pickWebImages({})).rejects.toThrow('unsupported')
  })

  it('refuses a huge file before decoding it', async () => {
    mocks.pickFiles.mockResolvedValue([
      Object.defineProperty(file('huge.jpg'), 'size', {
        value: MAX_PHOTO_BYTES + 1,
      }),
    ])
    await expect(pickWebImages({})).rejects.toMatchObject({
      reason: 'tooLarge',
    })
    expect(mocks.readImageSize).not.toHaveBeenCalled()
  })
})
