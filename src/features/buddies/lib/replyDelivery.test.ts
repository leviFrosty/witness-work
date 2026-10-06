import { describe, expect, it } from 'vitest'
import { replyDelivery } from '@/features/buddies/lib/replyDelivery'
import { REPLY_HOLD_MS } from '@/features/buddies/lib/state'

const answeredAt = 1_000_000
const held = {
  unsentReplyRev: answeredAt,
  replySendAt: answeredAt + REPLY_HOLD_MS,
}

describe('replyDelivery', () => {
  it('counts down the hold in whole seconds', () => {
    expect(replyDelivery(held, answeredAt, false)).toEqual({
      kind: 'countdown',
      seconds: 15,
    })
    expect(replyDelivery(held, answeredAt + 12_400, false)).toEqual({
      kind: 'countdown',
      seconds: 3,
    })
  })

  it('never counts past the hold on a render with a stale clock', () => {
    expect(replyDelivery(held, answeredAt - 60_000, false)).toEqual({
      kind: 'countdown',
      seconds: 15,
    })
  })

  it('reads as sending right after the hold, then unsent if it failed', () => {
    const due = answeredAt + REPLY_HOLD_MS
    expect(replyDelivery(held, due + 1_000, false)).toEqual({
      kind: 'sending',
    })
    expect(replyDelivery(held, due + 30_000, false)).toEqual({
      kind: 'unsent',
    })
    expect(replyDelivery(held, due + 30_000, true)).toEqual({
      kind: 'sending',
    })
  })

  it('says nothing once the answer reached the buddy', () => {
    expect(replyDelivery({}, answeredAt, false)).toEqual({ kind: 'sent' })
    expect(replyDelivery(undefined, answeredAt, false)).toEqual({
      kind: 'sent',
    })
  })
})
