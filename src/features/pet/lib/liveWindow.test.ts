import { describe, expect, it } from 'vitest'
import {
  isSouthernHemisphere,
  resolveWindow,
  seasonAt,
  timeOfDayAt,
} from '@/features/pet/lib/liveWindow'

const at = (month: number, hour: number, minute = 0) =>
  new Date(2026, month, 15, hour, minute)

describe('live window', () => {
  it.each([
    [0, 0, 'night'],
    [5, 59, 'night'],
    [6, 0, 'dawn'],
    [8, 59, 'dawn'],
    [9, 0, 'day'],
    [16, 59, 'day'],
    [17, 0, 'dusk'],
    [19, 59, 'dusk'],
    [20, 0, 'night'],
    [23, 59, 'night'],
  ])('%i:%i local is %s', (hour, minute, time) => {
    expect(timeOfDayAt(at(5, hour, minute))).toBe(time)
  })

  it.each([
    [0, 'winter', 'summer'],
    [1, 'winter', 'summer'],
    [2, 'spring', 'autumn'],
    [4, 'spring', 'autumn'],
    [5, 'summer', 'winter'],
    [7, 'summer', 'winter'],
    [8, 'autumn', 'spring'],
    [10, 'autumn', 'spring'],
    [11, 'winter', 'summer'],
  ])('month %i is %s up north and %s down south', (month, north, south) => {
    expect(seasonAt(at(month, 12), 'US')).toBe(north)
    expect(seasonAt(at(month, 12), 'AU')).toBe(south)
  })

  it('flips countries mostly south of the equator, territories included', () => {
    for (const region of [
      'ID',
      'RW',
      'BI',
      'KM',
      'SC',
      'FK',
      'NR',
      'TV',
      'CD',
      'EC',
      'SH',
      'WF',
    ])
      expect(isSouthernHemisphere(region)).toBe(true)

    for (const region of ['KE', 'UG', 'SO', 'KI', 'MV', 'CO', 'ST'])
      expect(isSouthernHemisphere(region)).toBe(false)
  })

  it('reads region codes in any case, and no region as northern', () => {
    expect(isSouthernHemisphere('nz')).toBe(true)
    expect(isSouthernHemisphere('ZA')).toBe(true)
    expect(isSouthernHemisphere('GB')).toBe(false)
    expect(isSouthernHemisphere(null)).toBe(false)
    expect(seasonAt(at(0, 12))).toBe('winter')
  })

  it('follows the clock only for live parts', () => {
    expect(
      resolveWindow({ time: 'live', season: 'live' }, at(6, 21), 'BR')
    ).toEqual({
      time: 'night',
      season: 'winter',
      liveTime: true,
      liveSeason: true,
    })
    expect(
      resolveWindow({ time: 'dawn', season: 'autumn' }, at(6, 21), 'BR')
    ).toEqual({
      time: 'dawn',
      season: 'autumn',
      liveTime: false,
      liveSeason: false,
    })
  })
})
