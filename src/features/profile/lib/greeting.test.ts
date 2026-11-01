import { describe, expect, it } from 'vitest'
import { pickGreeting } from '@/features/profile/lib/greeting'

const tuesdayAt = (hour: number, day = 6) => new Date(2026, 9, day, hour, 30)
const at = (now: Date, streak = 0, goalReached = false) =>
  pickGreeting({ now, streak, goalReached })

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
    expect(at(new Date(2026, 10, 1, 8)).key).toBe('greetingNewMonth')
  })

  it('cheers a streak of three or more, leaving its length to the badge', () => {
    expect(at(tuesdayAt(9), 2).key).toMatch(/GoodMorning|FreshStart|Going/)
    const short = at(tuesdayAt(9), 3)
    expect(short.key).toMatch(/BusyBee|OnARoll/)
    expect(short).not.toHaveProperty('count')
    expect(at(tuesdayAt(9), 7).key).toMatch(/GoingStrong|LookAtYouGo/)
  })

  it('puts a streak ahead of the calendar', () => {
    expect(at(new Date(2026, 9, 10, 9), 4).key).toMatch(/BusyBee|OnARoll/)
  })

  it('puts a reached goal ahead of everything', () => {
    expect(at(tuesdayAt(2), 10, true).key).toMatch(/^greetingGoal/)
  })
})
