import { describe, expect, it } from 'vitest'
import { downloadFileName, fileExtension } from '@/lib/files/fileNames'

describe('download file names', () => {
  it('keeps an ordinary name as it is', () => {
    expect(downloadFileName('witness-work-backup.json')).toBe(
      'witness-work-backup.json'
    )
    expect(downloadFileName('María_José_2025-03-02.witnesswork')).toBe(
      'María_José_2025-03-02.witnesswork'
    )
  })

  it('removes path separators and characters Windows refuses', () => {
    expect(downloadFileName('../../etc/passwd')).toBe('etc-passwd')
    expect(downloadFileName('a\\b:c*d?"e<f>g|h.csv')).toBe(
      'a-b-c-d-e-f-g-h.csv'
    )
    expect(downloadFileName('line\nbreak\u0000.csv')).toBe('line-break-.csv')
  })

  it('drops leading and trailing dots and spaces', () => {
    expect(downloadFileName('  ..hidden.json  ')).toBe('hidden.json')
    expect(downloadFileName('report.')).toBe('report')
    expect(downloadFileName('😀'.repeat(100)).isWellFormed()).toBe(true)
  })

  it('falls back when nothing usable is left', () => {
    expect(downloadFileName('')).toBe('download')
    expect(downloadFileName('...')).toBe('download')
    expect(downloadFileName('///', 'backup.json')).toBe('backup.json')
  })

  it('shortens a long name but keeps its extension', () => {
    const name = downloadFileName(`${'a'.repeat(300)}.witnesswork`)
    expect(name.length).toBeLessThanOrEqual(120)
    expect(name.endsWith('.witnesswork')).toBe(true)
  })

  it('finds extensions', () => {
    expect(fileExtension('Report.CSV')).toBe('csv')
    expect(fileExtension('.hidden')).toBe('')
    expect(fileExtension('noextension')).toBe('')
  })
})
