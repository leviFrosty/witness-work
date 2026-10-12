import { describe, expect, it } from 'vitest'
import { planShareKey } from '@/features/buddies/lib/shares'
import {
  decodeSharedNoteDoc,
  encodeSharedNoteDoc,
  localSharedPhotoId,
  openSharedPhoto,
  sealSharedPhoto,
  sharedNoteFields,
} from '@/features/buddies/lib/sharedNotes'
import {
  incomingShareKey,
  type OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import {
  pair,
  random,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc } from '@/lib/richText/notes'
import { deflateSync, strToU8 } from 'fflate'
import { toB64u } from '@/features/buddies/lib/bytes'
import type { RichTextDoc } from '@/types/richText'

const PHOTO = 'a1b2c3d4-0000-4000-8000-000000000001'
const DAY = 24 * 60 * 60 * 1000

const doc: RichTextDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Meet at the hall', marks: [{ type: 'bold' }] },
      ],
    },
    { type: 'image', attrs: { id: PHOTO, width: 400, height: 300 } },
  ],
}

const spec = (recipients: string[], noteDoc = doc): OutgoingShareSpec => ({
  key: planShareKey('sat'),
  type: 'plan',
  details: { d: '2026-09-26', s: 600, m: 120, note: 'Meet at the hall' },
  noteDoc,
  recipients,
  endsAt: Date.parse('2026-09-27T00:00:00Z'),
  expiresAt: Date.parse('2026-09-28T00:00:00Z'),
})

describe('shared note encoding', () => {
  it('round-trips a doc', () => {
    expect(decodeSharedNoteDoc(encodeSharedNoteDoc(doc))).toEqual(doc)
  })

  it('refuses what is not a deflated doc, or too big once inflated', () => {
    expect(decodeSharedNoteDoc('not base64url!')).toBeNull()
    expect(decodeSharedNoteDoc(toB64u(strToU8('plain')))).toBeNull()
    const bomb = toB64u(deflateSync(strToU8(' '.repeat(2 * 1024 * 1024))))
    expect(decodeSharedNoteDoc(bomb)).toBeNull()
  })

  it('opens only the blob the event named', () => {
    const key = random(32)
    const { sealed, blobId } = sealSharedPhoto(
      new Uint8Array([1, 2, 3]),
      key,
      random(12)
    )
    const photo = { blob: blobId, key: toB64u(key) }
    expect(openSharedPhoto(sealed, photo)).toEqual(new Uint8Array([1, 2, 3]))
    expect(
      openSharedPhoto(sealed, { ...photo, key: toB64u(random(32)) })
    ).toBeNull()
    const tampered = sealed.slice()
    tampered[tampered.length - 1] ^= 1
    expect(openSharedPhoto(tampered, photo)).toBeNull()
  })

  it('points shared photos at local files and drops ones without a blob', () => {
    const blob = toB64u(random(32))
    const fields = sharedNoteFields({
      d: '2026-09-26',
      note: 'Meet at the hall',
      noteDoc: encodeSharedNoteDoc({
        ...doc,
        content: [
          doc.content[0],
          {
            type: 'image',
            attrs: { id: PHOTO, width: 400, height: 300, scale: 0.5 },
          },
          {
            type: 'image',
            attrs: { id: 'ffffffff-no-blob', width: 1, height: 1 },
          },
        ],
      }),
      photos: [
        {
          id: PHOTO,
          blob,
          token: toB64u(random(32)),
          key: toB64u(random(32)),
          w: 40,
          h: 30,
        },
      ],
    })
    // The photo keeps the share of the note it was resized to.
    expect(richTextImages(getNoteDoc(fields))).toEqual([
      { id: localSharedPhotoId(blob), width: 40, height: 30, scale: 0.5 },
    ])
    expect(localSharedPhotoId(blob)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('sharing photos with buddies', () => {
  function users(env: ReturnType<typeof setup>) {
    const saved = new Map<string, Uint8Array>()
    const jpeg = new Uint8Array(5000).map((_, i) => i % 251)
    const levi = env.user('Levi', undefined, undefined, {
      readSharedPhoto: async (image) =>
        image.id === PHOTO ? { bytes: jpeg, width: 400, height: 300 } : null,
    })
    let arrived = 0
    const anna = env.user('Anna', undefined, undefined, {
      hasSharedPhoto: async (id) => saved.has(id),
      saveSharedPhoto: async (id, bytes) => {
        saved.set(id, bytes)
      },
      onSharedPhotosSaved: () => {
        arrived++
      },
    })
    return { levi, anna, saved, jpeg, arrived: () => arrived }
  }

  it('uploads a photo once and the buddy downloads and opens it', async () => {
    const env = setup()
    const { levi, anna, saved, jpeg, arrived } = users(env)
    await pair(levi, anna)
    // Sync once so Levi knows the relay takes photos.
    await levi.engine.sync()
    levi.setShares([spec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(1)

    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const share =
      anna.store.getState().incomingShares[
        incomingShareKey(levi.inboxId, shareId)
      ]
    expect(share.details.photos).toHaveLength(1)
    const fields = sharedNoteFields(share.details)
    const [image] = richTextImages(getNoteDoc(fields))
    expect(saved.get(image.id)).toEqual(jpeg)
    expect(arrived()).toBe(1)
    // The blob is ciphertext, never the photo.
    const [stored] = [...env.fake.blobs.values()]
    expect(stored.data).not.toEqual(jpeg)

    // Publishing again reuses the upload and sends nothing new.
    const events = env.fake.inboxes.get(anna.inboxId)!.events.length
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(1)
    expect(env.fake.inboxes.get(anna.inboxId)!.events.length).toBe(events)
  })

  it('shares formatting without photos while the relay turns them off', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    env.fake.capabilities.photos = false
    await pair(levi, anna)
    await levi.engine.sync()
    levi.setShares([spec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(0)

    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const share =
      anna.store.getState().incomingShares[
        incomingShareKey(levi.inboxId, shareId)
      ]
    expect(share.details.photos).toBeUndefined()
    const shown = getNoteDoc(sharedNoteFields(share.details))
    expect(shown.content).toEqual([doc.content[0]])
  })

  it('deletes uploads no share uses any more', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    levi.setShares([spec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(1)
    levi.setShares([])
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(0)
    expect(levi.store.getState().sharedPhotos).toEqual({})
  })

  it('keeps a photo as long as its share, unless it is taken out first', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    const ends = Date.parse('2026-09-27T00:00:00Z')
    const share = {
      ...spec([anna.inboxId]),
      endsAt: ends,
      expiresAt: ends + 30 * DAY,
    }
    levi.setShares([share])
    await levi.engine.publishShares()
    const [stored] = [...env.fake.blobs.values()]
    // A month after the Plan, like the share.
    expect(stored.expiresAt).toBe(ends + 30 * DAY)

    // The Plan has happened and is still shared; the photo stays.
    env.advance(ends + 2 * DAY - env.now())
    levi.setShares([share])
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(1)

    // Taken out of the note while the share lasts: deleted at once.
    levi.setShares([
      { ...share, noteDoc: { type: 'doc', content: [doc.content[0]] } },
    ])
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(0)
  })

  it('uploads a photo for a Plan months out again before its copy runs out', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    const ends = env.now() + 200 * DAY
    const share = {
      ...spec([anna.inboxId]),
      endsAt: ends,
      expiresAt: ends + 30 * DAY,
    }
    levi.setShares([share])
    await levi.engine.publishShares()
    const first = levi.store.getState().sharedPhotos[PHOTO]
    // The relay keeps a photo at most 90 days.
    expect(first.expiresAt).toBe(env.now() + 89 * DAY)

    // With two months left, the same copy does.
    env.advance(30 * DAY)
    await levi.engine.publishShares()
    expect(levi.store.getState().sharedPhotos[PHOTO].blob).toBe(first.blob)

    // With under a month left, a new copy replaces it and the old one goes.
    env.advance(30 * DAY)
    await levi.engine.publishShares()
    const second = levi.store.getState().sharedPhotos[PHOTO]
    expect(second.blob).not.toBe(first.blob)
    expect(second.expiresAt).toBe(env.now() + 89 * DAY)
    expect(env.fake.blobs.size).toBe(1)

    // Anna's copy of the Plan points at the new photo.
    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const got =
      anna.store.getState().incomingShares[
        incomingShareKey(levi.inboxId, shareId)
      ]
    expect(got.details.photos?.[0].blob).toBe(second.blob)
  })

  it('shares formatting without photos when the relay wants a buddy first', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    env.fake.inboxes.get(levi.inboxId)!.slots.clear()
    levi.setShares([spec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(env.fake.blobs.size).toBe(0)
    expect(levi.store.getState().photosAvailable).toBe(true)
  })

  it('leaves photos and formatting out before shortening the note', async () => {
    const env = setup()
    const { levi, anna } = users(env)
    await pair(levi, anna)
    await levi.engine.sync()
    const long = 'x'.repeat(2000)
    levi.setShares([
      {
        ...spec([anna.inboxId]),
        details: { d: '2026-09-26', note: long },
        noteDoc: {
          type: 'doc',
          content: Array.from({ length: 400 }, (_, i) => ({
            type: 'paragraph' as const,
            content: [
              {
                type: 'text' as const,
                text: `line ${i} ${toB64u(random(24))}`,
                marks: [{ type: 'bold' as const }],
              },
            ],
          })),
        },
      },
    ])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const share =
      anna.store.getState().incomingShares[
        incomingShareKey(levi.inboxId, shareId)
      ]
    expect(share.details.noteDoc).toBeUndefined()
    expect(share.details.note).toBe(long)
  })
})
