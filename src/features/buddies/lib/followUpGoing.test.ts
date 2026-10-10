import { describe, expect, it } from 'vitest'
import { followUpGoingSentences } from '@/features/buddies/lib/followUpGoing'

describe('followUpGoingSentences', () => {
  it('is empty with no one invited', () => {
    expect(followUpGoingSentences([])).toEqual([])
  })

  it('says one sentence per answer, going first', () => {
    expect(
      followUpGoingSentences([
        { name: 'Marco' },
        { name: 'Anna', reply: 'going' },
        { name: 'Lena', reply: 'declined' },
      ])
    ).toEqual([
      {
        answer: 'going',
        key: 'buddies_followUpGoingOne',
        values: { name: 'Anna' },
      },
      {
        answer: 'declined',
        key: 'buddies_followUpDeclinedOne',
        values: { name: 'Lena' },
      },
      {
        answer: 'waiting',
        key: 'buddies_followUpWaitingOne',
        values: { name: 'Marco' },
      },
    ])
  })

  it('names two and counts three or more', () => {
    expect(
      followUpGoingSentences([
        { name: 'Anna', reply: 'going' },
        { name: 'Ben', reply: 'going' },
        { name: 'Marco' },
        { name: 'Lena' },
        { name: 'Grace' },
      ])
    ).toEqual([
      {
        answer: 'going',
        key: 'buddies_followUpGoingTwo',
        values: { first: 'Anna', second: 'Ben' },
      },
      {
        answer: 'waiting',
        key: 'buddies_followUpWaitingMany',
        values: { count: '3' },
      },
    ])
  })
})
