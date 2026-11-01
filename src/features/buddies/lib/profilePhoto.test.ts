import { describe, expect, it } from 'vitest'
import { toB64u } from '@/features/buddies/lib/bytes'
import {
  type BuddyAvatar,
  buddyAvatarSchema,
} from '@/features/buddies/lib/schemas'
import {
  openSharedPhoto,
  PROFILE_PHOTO_AAD,
  sealSharedPhoto,
} from '@/features/buddies/lib/sharedNotes'
import {
  pair,
  random,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'

const DAY = 24 * 60 * 60 * 1000
const THUMBNAIL = 'dGh1bWJuYWls'

describe('Profile photos at full size', () => {
  function users(env: ReturnType<typeof setup>) {
    let photo: Uint8Array | null = new Uint8Array(50_000).map((_, i) => i % 251)
    const levi = env.user('Levi', undefined, undefined, {
      readProfilePhoto: async () => photo,
    })
    levi.profile.avatar = { t: 'image', v: THUMBNAIL }
    const kept: string[][] = []
    const anna = env.user('Anna', undefined, undefined, {
      keepBuddyPhotos: async (blobIds) => {
        kept.push(blobIds)
      },
    })
    return {
      levi,
      anna,
      kept,
      photo: () => photo,
      setPhoto: (next: Uint8Array | null) => {
        photo = next
      },
    }
  }

  const leviFor = (anna: ReturnType<typeof users>['anna'], inboxId: string) =>
    anna.store.getState().buddies.find((b) => b.inboxId === inboxId)!

  const fullOf = (avatar: BuddyAvatar | undefined) =>
    avatar?.t === 'image' ? avatar.full : undefined

  it('links the photo from the card, and the buddy opens it', async () => {
    const env = setup()
    const { levi, anna, kept, photo } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    expect(env.fake.blobs.size).toBe(1)

    await anna.engine.sync()
    const avatar = leviFor(anna, levi.inboxId).avatar
    expect(avatar).toMatchObject({ t: 'image', v: THUMBNAIL })
    const full = fullOf(avatar)!
    expect(await anna.engine.fetchBuddyPhoto(levi.inboxId, full)).toEqual(
      photo()
    )

    const [stored] = [...env.fake.blobs.values()]
    expect(stored.data).not.toEqual(photo())
    expect(stored.expiresAt).toBe(env.now() + 89 * DAY)

    expect(kept.at(-1)).toEqual([full.blob])

    const seq = env.fake.inboxes.get(anna.inboxId)!.seq
    await levi.engine.sync()
    expect(env.fake.blobs.size).toBe(1)
    expect(env.fake.inboxes.get(anna.inboxId)!.seq).toBe(seq)
  })

  it('replaces the upload when the photo changes', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    await anna.engine.sync()
    const first = fullOf(leviFor(anna, levi.inboxId).avatar)!

    levi.profile.avatar = { t: 'image', v: 'bmV3IHRodW1i' }
    await levi.engine.sync()
    await anna.engine.sync()
    const second = fullOf(leviFor(anna, levi.inboxId).avatar)!
    expect(second.blob).not.toBe(first.blob)
    expect(env.fake.blobs.size).toBe(1)
    expect(await anna.engine.fetchBuddyPhoto(levi.inboxId, first)).toBeNull()
  })

  it('deletes the upload once the photo is no longer shared', async () => {
    const env = setup()
    const { levi, anna, kept } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    expect(env.fake.blobs.size).toBe(1)

    await levi.engine.setSharing({ photo: false })
    expect(env.fake.blobs.size).toBe(0)
    expect(levi.store.getState().profilePhoto).toBeNull()
    await anna.engine.sync()
    expect(leviFor(anna, levi.inboxId).avatar).toBeUndefined()
    expect(kept.at(-1)).toEqual([])
  })

  it('sends the thumbnail alone while the photo cannot be uploaded', async () => {
    const env = setup()
    const { levi, anna, setPhoto } = users(env)
    env.fake.capabilities.photos = false
    await pair(levi, anna)
    await levi.engine.sync()
    await anna.engine.sync()
    expect(env.fake.blobs.size).toBe(0)
    expect(leviFor(anna, levi.inboxId).avatar).toEqual({
      t: 'image',
      v: THUMBNAIL,
    })

    env.fake.capabilities.photos = true
    setPhoto(null)
    await levi.engine.sync()
    expect(env.fake.blobs.size).toBe(0)

    setPhoto(new Uint8Array([1, 2, 3]))
    await levi.engine.sync()
    await anna.engine.sync()
    expect(fullOf(leviFor(anna, levi.inboxId).avatar)).toBeDefined()
  })

  it('uploads again before the relay deletes its copy', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    const first = levi.store.getState().profilePhoto!

    env.advance(30 * DAY)
    await levi.engine.sync()
    expect(levi.store.getState().profilePhoto!.blob).toBe(first.blob)

    env.advance(30 * DAY)
    await levi.engine.sync()
    const second = levi.store.getState().profilePhoto!
    expect(second.blob).not.toBe(first.blob)
    expect(second.expiresAt).toBe(env.now() + 89 * DAY)
    expect(env.fake.blobs.size).toBe(1)
    await anna.engine.sync()
    expect(fullOf(leviFor(anna, levi.inboxId).avatar)?.blob).toBe(second.blob)
  })

  it("opens only a Profile photo, not a note's photo", () => {
    const key = random(32)
    const { sealed, blobId } = sealSharedPhoto(
      new Uint8Array([1, 2, 3]),
      key,
      random(12)
    )
    const photo = { blob: blobId, key: toB64u(key) }
    expect(openSharedPhoto(sealed, photo, PROFILE_PHOTO_AAD)).toBeNull()
  })

  it('keeps the thumbnail when a link is one this build cannot read', () => {
    expect(
      buddyAvatarSchema.parse({
        t: 'image',
        v: THUMBNAIL,
        full: { blob: 'newer', size: 2048 },
      })
    ).toEqual({ t: 'image', v: THUMBNAIL })
  })
})
