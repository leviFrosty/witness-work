import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  base64ToBytes,
  buildFileBlob,
  downloadBlob,
} from '@/lib/files/download'

describe('building the file', () => {
  it('makes a text Blob with the MIME type', async () => {
    const blob = buildFileBlob({ text: '{"a":"é"}' }, 'application/json')
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe('{"a":"é"}')
  })

  it('decodes base64 bytes exactly', async () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]
    const base64 = Buffer.from(png).toString('base64')
    expect([...base64ToBytes(base64)]).toEqual(png)
    const blob = buildFileBlob({ base64 }, 'image/png')
    expect(blob.type).toBe('image/png')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual(png)
  })

  it('rejects malformed base64', () => {
    expect(() => base64ToBytes('not base64!!')).toThrow()
  })
})

describe('downloadBlob', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('clicks a link attached to the page, then cleans up', () => {
    vi.useFakeTimers()
    const link = {
      href: '',
      download: '',
      rel: '',
      style: {} as Record<string, string>,
      click: vi.fn(),
      remove: vi.fn(),
    }
    const body = { appendChild: vi.fn() }
    vi.stubGlobal('document', {
      createElement: vi.fn(() => link),
      body,
    })
    const createObjectURL = vi.fn(() => 'blob:http://localhost/abc')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const blob = new Blob(['x'], { type: 'text/csv' })
    downloadBlob(blob, 'trips: March?.csv')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(link.href).toBe('blob:http://localhost/abc')
    expect(link.download).toBe('trips- March-.csv')
    expect(body.appendChild).toHaveBeenCalledWith(link)
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/abc')
  })
})
