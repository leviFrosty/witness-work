import { describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  writeAsStringAsync: vi.fn(async () => {}),
  shareAsync: vi.fn(async () => {}),
  isAvailableAsync: vi.fn(async () => true),
}))
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: native.writeAsStringAsync,
}))
vi.mock('expo-sharing', () => ({
  shareAsync: native.shareAsync,
  isAvailableAsync: native.isAvailableAsync,
}))

import {
  canExportFiles,
  deliverExport,
  prepareExport,
} from '@/lib/files/exportFile'

describe('native file export', () => {
  it('writes text to the cache folder and opens the share sheet', async () => {
    await expect(canExportFiles()).resolves.toBe(true)
    const prepared = await prepareExport({
      fileName: 'trips.csv',
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
      dialogTitle: 'Export CSV',
      text: 'a,b',
      purpose: 'save',
    })
    expect(native.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/trips.csv',
      'a,b'
    )
    await deliverExport(prepared)
    expect(native.shareAsync).toHaveBeenCalledWith('file:///cache/trips.csv', {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export CSV',
    })
  })

  it('writes images as base64', async () => {
    await prepareExport({
      fileName: 'pet.png',
      mimeType: 'image/png',
      base64: 'iVBORw0KGgo=',
      purpose: 'send',
    })
    expect(native.writeAsStringAsync).toHaveBeenLastCalledWith(
      'file:///cache/pet.png',
      'iVBORw0KGgo=',
      { encoding: 'base64' }
    )
  })
})
