import { describe, expect, it } from 'vitest'
import { measureReward, registerRewardProbe } from '@/lib/actionRewards'

describe('measureReward', () => {
  it('asks each probe before the save and after it', () => {
    let earned = 0
    const actions: string[] = []
    const remove = registerRewardProbe((action) => {
      actions.push(action)
      const before = earned
      return () =>
        earned > before
          ? { label: `Earned ${earned - before}`, render: () => null }
          : null
    })
    const nothing = measureReward('time')
    expect(nothing()).toBeUndefined()
    const some = measureReward('time')
    earned += 3
    expect(some()?.label).toBe('Earned 3')
    remove()
    const gone = measureReward('time')
    earned += 1
    expect(gone()).toBeUndefined()
    expect(actions).toEqual(['time', 'time'])
  })
})
