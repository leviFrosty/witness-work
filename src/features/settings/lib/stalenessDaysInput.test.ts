import { describe, expect, it } from 'vitest'
import { readStalenessDaysInput } from '@/features/settings/lib/stalenessDaysInput'

describe('readStalenessDaysInput', () => {
  it('stores whole day counts of at least one', () => {
    expect(readStalenessDaysInput('1', 7)).toBe(1)
    expect(readStalenessDaysInput('14', 7)).toBe(14)
    expect(readStalenessDaysInput('365', 7)).toBe(365)
  })

  it('keeps the value from before the edit while the field is blank', () => {
    expect(readStalenessDaysInput('', 10)).toBe(10)
  })

  it('keeps the value from before the edit for 0', () => {
    expect(readStalenessDaysInput('0', 10)).toBe(10)
    expect(readStalenessDaysInput('00', 10)).toBe(10)
  })

  it('reads digits from other numbering systems', () => {
    expect(readStalenessDaysInput('١٤', 7)).toBe(14)
  })

  it('rejects anything but digits', () => {
    expect(readStalenessDaysInput('7.5', 7)).toBeNull()
    expect(readStalenessDaysInput('-3', 7)).toBeNull()
    expect(readStalenessDaysInput('1a', 7)).toBeNull()
  })
})
