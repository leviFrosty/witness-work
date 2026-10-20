import { describe, expect, it } from 'vitest'

import { PET_SPECIES_IDS } from '../art/types'
import {
  ENTRANCES,
  evaluateMotion,
  REST_POSE,
  TRICKS,
  WAKE,
  type MotionTable,
} from '.'

const tables: [string, MotionTable][] = [
  ...PET_SPECIES_IDS.map(
    (s) => [`entrance ${s}`, ENTRANCES[s]] as [string, MotionTable]
  ),
  ...PET_SPECIES_IDS.map(
    (s) => [`trick ${s}`, TRICKS[s]] as [string, MotionTable]
  ),
  ['wake', WAKE],
]

describe('motion tables', () => {
  it.each(tables)(
    '%s lasts 1–3 s, speaks during it and ends at rest',
    (_name, table) => {
      expect(table.durationMs).toBeGreaterThanOrEqual(1000)
      expect(table.durationMs).toBeLessThanOrEqual(3000)
      expect(table.sayAtMs).toBeGreaterThan(0)
      expect(table.sayAtMs).toBeLessThan(table.durationMs)
      const end = evaluateMotion(table, table.durationMs)
      expect(end.pose).toMatchObject({
        dx: 0,
        dy: 0,
        flip: false,
        lie: false,
        bobAdd: 0,
      })
      expect(evaluateMotion(table, table.durationMs + 1).done).toBe(true)
      expect(evaluateMotion(table, table.durationMs).done).toBe(false)
      for (const broken of [Number.NaN, Infinity, -Infinity]) {
        const frame = evaluateMotion(table, broken)
        expect(frame).toMatchObject({ done: true, sayDue: false })
        expect(frame.pose).toEqual(end.pose)
      }
    }
  )

  it.each(tables)(
    '%s stays on stage-ish and has finite poses',
    (_name, table) => {
      for (let u = 0; u <= table.durationMs; u += 10) {
        const { pose } = evaluateMotion(table, u)
        expect(Number.isFinite(pose.dx)).toBe(true)
        expect(Number.isFinite(pose.dy)).toBe(true)
        expect(Math.abs(pose.dx)).toBeLessThanOrEqual(110)
        expect(pose.dy).toBeGreaterThanOrEqual(-90)
        expect(pose.dy).toBeLessThanOrEqual(0)
      }
    }
  )

  it('starts entrances off the card in the described direction', () => {
    expect(evaluateMotion(ENTRANCES.lion, 0).pose.dx).toBe(-100)
    expect(evaluateMotion(ENTRANCES.dog, 0).pose.dx).toBe(110)
    expect(evaluateMotion(ENTRANCES.cat, 0).pose.dy).toBe(-90)
    expect(evaluateMotion(ENTRANCES.donkey, 0).pose.dx).toBe(-100)
    expect(evaluateMotion(ENTRANCES.lamb, 0).pose.dx).toBe(100)
  })

  it('fills unset fields from the rest pose and flags the sound', () => {
    const f = evaluateMotion(ENTRANCES.cat, 1500)
    expect(f.pose).toEqual({ ...REST_POSE, mood: 'joy' })
    expect(f.sayDue).toBe(true)
    expect(evaluateMotion(ENTRANCES.cat, 0).sayDue).toBe(false)
  })

  it('sweeps colour back from the feet up during the wake', () => {
    expect(WAKE.colorFromRow(0)).toBe(31)
    expect(WAKE.colorFromRow(400)).toBe(15)
    expect(WAKE.colorFromRow(799)).toBe(0)
    expect(WAKE.colorFromRow(800)).toBeNull()
    expect(evaluateMotion(WAKE, 100).pose.mood).toBe('dead')
    expect(evaluateMotion(WAKE, 950).pose.dy).toBeLessThan(0)
  })
})
