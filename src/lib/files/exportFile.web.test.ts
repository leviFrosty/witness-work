import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }))
vi.mock('@/lib/files/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/files/download')>()),
  downloadBlob: download.downloadBlob,
}))

import {
  canExportFiles,
  deliverExport,
  prepareExport,
} from '@/lib/files/exportFile.web'

const touch = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches }))
  )

describe('web file export', () => {
  beforeEach(() => {
    download.downloadBlob.mockClear()
    vi.stubGlobal(
      'File',
      class extends Blob {
        constructor(
          parts: BlobPart[],
          readonly name: string,
          options?: BlobPropertyBag
        ) {
          super(parts, options)
        }
      }
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('can always export', async () => {
    await expect(canExportFiles()).resolves.toBe(true)
  })

  it('builds a Blob of the right type and a safe name', async () => {
    const prepared = await prepareExport({
      fileName: 'Maria/Santos 2025-03-02.witnesswork',
      mimeType: 'application/witnesswork+json',
      text: '{"name":"Maria"}',
      purpose: 'send',
    })
    expect(prepared.blob.type).toBe('application/witnesswork+json')
    expect(await prepared.blob.text()).toBe('{"name":"Maria"}')
    expect(prepared.file.fileName).toBe('Maria-Santos 2025-03-02.witnesswork')
  })

  it('downloads a saved file even where the browser can share', async () => {
    touch(true)
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => true, share })
    await deliverExport(
      await prepareExport({
        fileName: 'witness-work-backup.json',
        mimeType: 'application/json',
        text: '{}',
        purpose: 'save',
      })
    )
    expect(share).not.toHaveBeenCalled()
    expect(download.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'witness-work-backup.json'
    )
  })

  it('downloads a file for another app on a desktop', async () => {
    touch(false)
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => true, share })
    await deliverExport(
      await prepareExport({
        fileName: 'pet.png',
        mimeType: 'image/png',
        base64: 'iVBORw0KGgo=',
        purpose: 'send',
      })
    )
    expect(share).not.toHaveBeenCalled()
    expect(download.downloadBlob).toHaveBeenCalledOnce()
  })

  it('shares a file for another app on a phone that can share it', async () => {
    touch(true)
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { canShare: () => true, share })
    await deliverExport(
      await prepareExport({
        fileName: 'pet.png',
        mimeType: 'image/png',
        base64: 'iVBORw0KGgo=',
        dialogTitle: 'Rex',
        purpose: 'send',
      })
    )
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Rex', files: [expect.any(Blob)] })
    )
    expect(download.downloadBlob).not.toHaveBeenCalled()
  })

  it('downloads when the phone cannot share that file or the tap has lapsed', async () => {
    touch(true)
    const prepared = await prepareExport({
      fileName: 'Maria.witnesswork',
      mimeType: 'application/witnesswork+json',
      text: '{}',
      purpose: 'send',
    })
    vi.stubGlobal('navigator', { canShare: () => false, share: vi.fn() })
    await deliverExport(prepared)
    const lapsed = vi.fn(async () => {
      throw new DOMException('no gesture', 'NotAllowedError')
    })
    vi.stubGlobal('navigator', { canShare: () => true, share: lapsed })
    await deliverExport(prepared)
    expect(lapsed).toHaveBeenCalledOnce()
    expect(download.downloadBlob).toHaveBeenCalledTimes(2)
  })

  it('does not download after the User closes the share sheet', async () => {
    touch(true)
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('closed', 'AbortError')
      }),
    })
    await deliverExport(
      await prepareExport({
        fileName: 'pet.png',
        mimeType: 'image/png',
        base64: 'iVBORw0KGgo=',
        purpose: 'send',
      })
    )
    expect(download.downloadBlob).not.toHaveBeenCalled()
  })
})
