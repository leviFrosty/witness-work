import { describe, expect, it } from 'vitest'
import {
  shareSelection,
  wholeMarked,
} from '@/features/territories/lib/shareScope'

describe('shareSelection', () => {
  it('shares the whole territory when it has no streets yet', () => {
    expect(
      shareSelection({ mode: 'whole', picked: [], available: [], owner: true })
    ).toEqual({
      whole: true,
      chosen: [],
      streetIds: undefined,
      nothingPicked: false,
    })
    expect(wholeMarked('whole', true)).toBe(true)
  })

  it('shares the whole territory with every street', () => {
    expect(
      shareSelection({
        mode: 'whole',
        picked: ['a'],
        available: ['a', 'b'],
        owner: true,
      })
    ).toMatchObject({ whole: true, chosen: ['a', 'b'], streetIds: undefined })
  })

  it('shares only the picked streets and clears the whole mark', () => {
    expect(
      shareSelection({
        mode: 'streets',
        picked: ['b', 'gone'],
        available: ['a', 'b', 'c'],
        owner: true,
      })
    ).toEqual({
      whole: false,
      chosen: ['b'],
      streetIds: ['b'],
      nothingPicked: false,
    })
    expect(wholeMarked('streets', true)).toBe(false)
  })

  it('says nothing is picked when no street is', () => {
    expect(
      shareSelection({
        mode: 'streets',
        picked: [],
        available: ['a', 'b'],
        owner: true,
      })
    ).toMatchObject({ whole: false, nothingPicked: true })
  })

  it('never offers the whole territory to a holder', () => {
    expect(
      shareSelection({
        mode: 'whole',
        picked: [],
        available: ['a'],
        owner: false,
      })
    ).toEqual({
      whole: false,
      chosen: ['a'],
      streetIds: ['a'],
      nothingPicked: false,
    })
    expect(wholeMarked('whole', false)).toBe(false)
  })
})
