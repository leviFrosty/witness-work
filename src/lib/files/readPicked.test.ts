import { describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  readAsStringAsync: vi.fn(async () => 'from disk'),
}))
vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: native.readAsStringAsync,
}))

import { readPickedText } from '@/lib/files/readPicked'

describe('reading a picked file', () => {
  it('reads a browser file from the File itself', async () => {
    const file = new Blob(['{"hello":"wörld"}'])
    await expect(readPickedText({ uri: 'blob:x', file })).resolves.toBe(
      '{"hello":"wörld"}'
    )
    expect(native.readAsStringAsync).not.toHaveBeenCalled()
  })

  it('reads only the first bytes when asked', async () => {
    const file = new Blob(['0123456789'])
    await expect(
      readPickedText({ uri: 'blob:x', file }, { length: 4 })
    ).resolves.toBe('0123')
  })

  it('reads a native file by its path', async () => {
    await expect(readPickedText({ uri: 'file:///a.json' })).resolves.toBe(
      'from disk'
    )
    expect(native.readAsStringAsync).toHaveBeenCalledWith('file:///a.json')
    await readPickedText({ uri: 'file:///a.json' }, { length: 8 })
    expect(native.readAsStringAsync).toHaveBeenLastCalledWith(
      'file:///a.json',
      {
        position: 0,
        length: 8,
      }
    )
  })
})
