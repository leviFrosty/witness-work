import { afterEach, expect, it, vi } from 'vitest'
import { refreshLocalTimeOffset } from '@/lib/deviceTimeZone'

afterEach(() => {
  vi.restoreAllMocks()
})

it('reads a moment far from every earlier probe', () => {
  const read: number[] = []
  const original = Date.prototype.getTimezoneOffset
  vi.spyOn(Date.prototype, 'getTimezoneOffset').mockImplementation(function (
    this: Date
  ) {
    read.push(this.getTime())
    return original.call(this)
  })
  refreshLocalTimeOffset()
  refreshLocalTimeOffset()
  const [first, , second] = read
  const day = 24 * 60 * 60_000
  expect(first - Date.now()).toBeGreaterThan(100 * 365 * day)
  expect(second - first).toBeGreaterThan(300 * day)
})
