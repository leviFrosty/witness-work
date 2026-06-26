import { describe, expect, it } from 'vitest'
import { goalProgress } from '@/lib/goalProgress'

describe('lib/goalProgress', () => {
  describe('under goal', () => {
    it('reports a partial fraction, percent, and remaining minutes', () => {
      const result = goalProgress({ minutes: 5 * 60, goalMinutes: 10 * 60 })
      expect(result.fraction).toBe(0.5)
      expect(result.percent).toBe(50)
      expect(result.remaining).toBe(5 * 60)
      expect(result.over).toBe(0)
    })

    it('clamps negative progress to zero fraction without going past goal', () => {
      const result = goalProgress({ minutes: -10 * 60, goalMinutes: 10 * 60 })
      expect(result.fraction).toBe(0)
      // remaining never exceeds the goal even when minutes are negative
      expect(result.remaining).toBe(10 * 60)
      expect(result.over).toBe(0)
    })
  })

  describe('at goal', () => {
    it('is fully complete with nothing remaining and nothing over', () => {
      const result = goalProgress({ minutes: 10 * 60, goalMinutes: 10 * 60 })
      expect(result.fraction).toBe(1)
      expect(result.percent).toBe(100)
      expect(result.remaining).toBe(0)
      expect(result.over).toBe(0)
    })
  })

  describe('over goal', () => {
    it('clamps fraction to 1 but leaves percent and over unbounded', () => {
      const result = goalProgress({ minutes: 15 * 60, goalMinutes: 10 * 60 })
      expect(result.fraction).toBe(1)
      expect(result.percent).toBe(150)
      expect(result.remaining).toBe(0)
      expect(result.over).toBe(5 * 60)
    })
  })

  describe('zero goal', () => {
    it('treats a zero goal as already complete', () => {
      const result = goalProgress({ minutes: 0, goalMinutes: 0 })
      // Matches the historical calculateProgress behavior: NaN/Infinity -> 1.
      expect(result.fraction).toBe(1)
      expect(result.remaining).toBe(0)
      expect(result.over).toBe(0)
    })

    it('treats any logged time against a zero goal as complete', () => {
      const result = goalProgress({ minutes: 30 * 60, goalMinutes: 0 })
      expect(result.fraction).toBe(1)
      expect(result.remaining).toBe(0)
      expect(result.over).toBe(30 * 60)
    })
  })
})
