import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, { value }: { value: string }) =>
      `${value} ${{ fileSize_bytes: 'B', fileSize_kilobytes: 'KB', fileSize_megabytes: 'MB', fileSize_gigabytes: 'GB' }[key]}`,
  },
}))
vi.mock('@/lib/numbers', () => ({
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat('en-US', options).format(value),
}))
import { formatBytes } from '@/lib/formatBytes'

describe('formatBytes', () => {
  it('uses decimal units, so storage limits read as round numbers', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(48_200)).toBe('48 KB')
    expect(formatBytes(186_420_000)).toBe('186.4 MB')
    expect(formatBytes(200_000_000)).toBe('200 MB')
    expect(formatBytes(5_000_000_000)).toBe('5 GB')
    expect(formatBytes(null)).toBe('—')
  })
})
