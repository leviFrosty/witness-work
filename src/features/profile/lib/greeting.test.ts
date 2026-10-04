import { describe, expect, it } from 'vitest'
import { pickGreeting } from '@/features/profile/lib/greeting'

// 2026-10-06 is a Tuesday: no weekday or new-month greeting applies.
const tuesdayAt = (hour: number, day = 6) => new Date(2026, 9, day, hour, 30)

describe('pickGreeting', () => {
  it.each([
    [2, /StillUp|NightOwl|MidnightOil/],
    [6, /UpEarly|RiseAndShine|EarlyBird/],
    [9, /GoodMorning|Morning/],
    [14, /GoodAfternoon|HeyThere|DayGoingWell/],
    [18, /GoodEvening|Evening|HadGoodDay/],
    [22, /WindingDown|GoodEvening|NightOwl/],
  ])('greets for the time of day at %i:30', (hour, expected) => {
    expect(pickGreeting(tuesdayAt(hour)).key).toMatch(expected)
  })

  it('holds one greeting through a period', () => {
    expect(pickGreeting(tuesdayAt(12))).toEqual(pickGreeting(tuesdayAt(16)))
  })

  it('rotates greetings from day to day', () => {
    const keys = new Set(
      [6, 7, 8].map((day) => pickGreeting(tuesdayAt(9, day)).key)
    )
    expect(keys.size).toBe(3)
  })

  it('celebrates weekdays in their window only', () => {
    const saturday = (hour: number) => new Date(2026, 9, 10, hour)
    expect(pickGreeting(saturday(9)).key).toBe('greetingHappySaturday')
    expect(pickGreeting(saturday(14)).key).not.toBe('greetingHappySaturday')
    const friday = (hour: number) => new Date(2026, 9, 9, hour)
    expect(pickGreeting(friday(9)).key).not.toBe('greetingHappyFriday')
    expect(pickGreeting(friday(19)).key).toBe('greetingHappyFriday')
  })

  it('welcomes a new month over the weekday', () => {
    // 2026-11-01 is a Sunday.
    expect(pickGreeting(new Date(2026, 10, 1, 8)).key).toBe('greetingNewMonth')
  })
})
