import { describe, expect, it } from 'vitest'
import { pickGreeting } from '@/features/profile/lib/greeting'
import { consecutiveDaysStreak } from '@/features/profile/lib/profileStats'

// 2026-10-06 is a Tuesday: no weekday or new-month greeting applies.
const tuesdayAt = (hour: number, day = 6) => new Date(2026, 9, day, hour, 30)
const at = (now: Date, streakDays = 0, goalReached = false) =>
  pickGreeting({ now, streakDays, goalReached })

describe('pickGreeting', () => {
  it.each([
    [2, /NightOwl|StillUp|MidnightOil/],
    [6, /UpEarly|RiseAndShine|EarlyBird/],
    [9, /GoodMorning|FreshStart|MorningGoingWell/],
    [14, /GoodAfternoon|HeyThere|DayGoingWell/],
    [18, /GoodEvening|HadGoodDay|EveningWelcome/],
    [22, /WindingDown|GoodEvening|NightOwl/],
  ])('greets for the time of day at %i:30', (hour, expected) => {
    expect(at(tuesdayAt(hour)).key).toMatch(expected)
  })

  it('holds one greeting through a period', () => {
    expect(at(tuesdayAt(12))).toEqual(at(tuesdayAt(16)))
  })

  it('rotates greetings from day to day', () => {
    const keys = new Set([6, 7, 8].map((day) => at(tuesdayAt(9, day)).key))
    expect(keys.size).toBe(3)
  })

  it('celebrates weekdays in their window only', () => {
    const saturday = (hour: number) => new Date(2026, 9, 10, hour)
    expect(at(saturday(9)).key).toBe('greetingHappySaturday')
    expect(at(saturday(14)).key).not.toBe('greetingHappySaturday')
    const friday = (hour: number) => new Date(2026, 9, 9, hour)
    expect(at(friday(9)).key).not.toBe('greetingHappyFriday')
    expect(at(friday(19)).key).toBe('greetingHappyFriday')
  })

  it('welcomes a new month over the weekday', () => {
    // 2026-11-01 is a Sunday.
    expect(at(new Date(2026, 10, 1, 8)).key).toBe('greetingNewMonth')
  })

  it('cheers a streak of three days or more, with its length', () => {
    expect(at(tuesdayAt(9), 2).key).toMatch(/GoodMorning|FreshStart|Going/)
    const short = at(tuesdayAt(9), 3)
    expect(short.key).toMatch(/BusyBee|OnARoll/)
    expect(short.count).toBe(3)
    expect(at(tuesdayAt(9), 7).key).toMatch(/LongStreak|LookAtYouGo/)
  })

  it('puts a streak ahead of the calendar', () => {
    expect(at(new Date(2026, 9, 10, 9), 4).key).toMatch(/BusyBee|OnARoll/)
  })

  it('puts a reached goal ahead of everything', () => {
    expect(at(tuesdayAt(2), 10, true).key).toMatch(/^greetingGoal/)
  })
})

describe('consecutiveDaysStreak', () => {
  const daily = (...days: [string, number][]) => new Map(days)
  const now = new Date(2026, 9, 6, 12)

  it('counts back from today', () => {
    const d = daily(['2026-10-06', 30], ['2026-10-05', 60], ['2026-10-04', 15])
    expect(consecutiveDaysStreak(d, now)).toBe(3)
  })

  it('keeps the streak alive before today is logged', () => {
    const d = daily(['2026-10-05', 60], ['2026-10-04', 15])
    expect(consecutiveDaysStreak(d, now)).toBe(2)
  })

  it('stops at a gap or an empty entry', () => {
    const d = daily(['2026-10-06', 30], ['2026-10-05', 0], ['2026-10-04', 15])
    expect(consecutiveDaysStreak(d, now)).toBe(1)
    expect(consecutiveDaysStreak(daily(['2026-10-04', 15]), now)).toBe(0)
  })
})
