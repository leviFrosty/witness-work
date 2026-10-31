import { describe, expect, it, vi } from 'vitest'
import { MEMBER_AVATAR_MAX } from '@/lib/sharedSpaces/records'
import type { BuddyAvatar } from '@/features/buddies/lib/schemas'
import {
  carProfileSource,
  createCarProfile,
  type CarProfileDeps,
} from '@/app/sharedCars/carProfile'

function profileDeps(fields: Partial<CarProfileDeps> = {}) {
  const state = {
    name: 'Anna',
    inboxId: 'AAAAAAAAAAAAAAAAAAAAAA' as string | null,
    sharesPhoto: true,
    avatar: { t: 'image', v: 'big-jpeg' } as BuddyAvatar | undefined,
  }
  const shrink = vi.fn(async (jpeg: string) => `small:${jpeg}`)
  const deps: CarProfileDeps = {
    cardName: () => state.name,
    inboxId: () => state.inboxId,
    sharesPhoto: () => state.sharesPhoto,
    avatar: () => state.avatar,
    shrink,
    ...fields,
  }
  return { deps, state, shrink }
}

describe('the User’s profile on their Shared Cars', () => {
  it('is the Buddy Card’s name, the 40 px photo, and the User’s own inbox', async () => {
    const { deps, shrink } = profileDeps()
    const profile = createCarProfile(deps)
    await expect(profile()).resolves.toEqual({
      name: 'Anna',
      inboxId: 'AAAAAAAAAAAAAAAAAAAAAA',
      avatar: 'small:big-jpeg',
    })
    // Made small once, so every sync puts the same one.
    await profile()
    expect(shrink).toHaveBeenCalledTimes(1)
  })

  it('makes a new thumbnail small when the photo changes', async () => {
    const { deps, state, shrink } = profileDeps()
    const profile = createCarProfile(deps)
    await profile()
    state.avatar = { t: 'image', v: 'new-jpeg' }
    await expect(profile()).resolves.toMatchObject({
      avatar: 'small:new-jpeg',
    })
    expect(shrink).toHaveBeenCalledTimes(2)
  })

  it('carries an emoji as it is', async () => {
    const { deps, state, shrink } = profileDeps()
    state.avatar = { t: 'emoji', v: '🚗' }
    await expect(createCarProfile(deps)()).resolves.toMatchObject({
      avatar: '🚗',
    })
    expect(shrink).not.toHaveBeenCalled()
  })

  it('carries no photo or emoji while All Buddies don’t see it', async () => {
    const { deps, state } = profileDeps()
    state.sharesPhoto = false
    await expect(createCarProfile(deps)()).resolves.toEqual({
      name: 'Anna',
      inboxId: 'AAAAAAAAAAAAAAAAAAAAAA',
    })
  })

  it('leaves out a thumbnail too big for the member record, or one that failed', async () => {
    const big = profileDeps({
      shrink: async () => 'x'.repeat(MEMBER_AVATAR_MAX + 1),
    })
    await expect(createCarProfile(big.deps)()).resolves.not.toHaveProperty(
      'avatar'
    )
    const failing = profileDeps({
      shrink: async () => {
        throw new Error('decode')
      },
    })
    await expect(createCarProfile(failing.deps)()).resolves.not.toHaveProperty(
      'avatar'
    )
  })

  it('refuses before Buddies has registered this device', async () => {
    const { deps, state } = profileDeps()
    state.inboxId = null
    await expect(createCarProfile(deps)()).rejects.toThrow('Buddies')
  })

  it('changes its source only when what the record says would', () => {
    const { deps, state } = profileDeps()
    const before = carProfileSource(deps)
    state.sharesPhoto = false
    const hidden = carProfileSource(deps)
    expect(hidden).not.toBe(before)
    // Hidden: a new photo doesn't change the record.
    state.avatar = { t: 'emoji', v: '🚗' }
    expect(carProfileSource(deps)).toBe(hidden)
    state.name = 'Anna B.'
    expect(carProfileSource(deps)).not.toBe(hidden)
  })
})
