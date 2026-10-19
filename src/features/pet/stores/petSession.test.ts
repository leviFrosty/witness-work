import { beforeEach, describe, expect, it } from 'vitest'
import { usePetSession } from '@/features/pet/stores/petSession'

describe('pet session store', () => {
  beforeEach(() =>
    usePetSession.setState({
      entrance: null,
      command: null,
      devOverride: null,
      devSnapshot: null,
    })
  )

  it('hands a requested entrance out once', () => {
    usePetSession.getState().requestEntrance('cat')
    expect(usePetSession.getState().takeEntrance()).toBe('cat')
    expect(usePetSession.getState().takeEntrance()).toBeNull()
  })

  it('keeps the latest entrance', () => {
    usePetSession.getState().requestEntrance('cat')
    usePetSession.getState().requestEntrance('lamb')
    expect(usePetSession.getState().takeEntrance()).toBe('lamb')
  })

  it('numbers commands so repeats are told apart', () => {
    const first = usePetSession.getState().send({ kind: 'trick' })
    const second = usePetSession.getState().send({ kind: 'trick' })
    expect(second).toBeGreaterThan(first)
    expect(usePetSession.getState().command).toEqual({
      kind: 'trick',
      id: second,
    })
  })
})
