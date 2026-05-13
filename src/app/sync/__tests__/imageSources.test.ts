import { describe, expect, it } from 'vitest'
import {
  collectLocalAvatarSources,
  collectExpectedMarkerSources,
  applyDownloadedAvatars,
} from '../imageSources'
import { Contact } from '../../../types/contact'
import { ProfileAvatar } from '../../../types/avatar'

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'contact-1',
  name: 'Test',
  createdAt: new Date(0),
  ...overrides,
})

describe('collectLocalAvatarSources', () => {
  it('returns a contact source for each contact with a local file-backed image avatar', () => {
    const sources = collectLocalAvatarSources({
      contacts: [
        makeContact({
          id: 'abc',
          avatar: {
            type: 'image',
            value: 'file:///Docs/contact-abc-avatar.jpg?t=123',
          },
        }),
      ],
      profileAvatar: { type: 'none', value: '' },
      documentDirectory: 'file:///Docs/',
    })

    expect(sources).toEqual([
      {
        kind: 'contact',
        id: 'abc',
        localPath: 'file:///Docs/contact-abc-avatar.jpg',
      },
    ])
  })

  it('returns a profile source when profile avatar is a local file-backed image', () => {
    const sources = collectLocalAvatarSources({
      contacts: [],
      profileAvatar: {
        type: 'image',
        value: 'file:///Docs/profile-avatar.jpg?t=9',
      },
      documentDirectory: 'file:///Docs/',
    })

    expect(sources).toEqual([
      { kind: 'profile', localPath: 'file:///Docs/profile-avatar.jpg' },
    ])
  })

  it('skips contact avatars whose file:// path escapes the document directory', () => {
    // Defense-in-depth: a malicious import that slipped past the validator
    // could put any sandbox path into avatar.value. The push pipeline must
    // never accept a source path that lives outside its own document
    // directory, regardless of what the contact record claims.
    const sources = collectLocalAvatarSources({
      contacts: [
        makeContact({
          id: 'mmkv',
          avatar: {
            type: 'image',
            value: 'file:///Library/Caches/com.app/mmkv-secret',
          },
        }),
        makeContact({
          id: 'traversal',
          avatar: {
            type: 'image',
            value: 'file:///Docs/../Library/Application Support/secrets.json',
          },
        }),
        makeContact({
          id: 'sibling-prefix',
          // Tricky: `/Docs2/...` shares a string prefix with `/Docs/` but is
          // actually a different directory. The `/`-terminated comparison
          // must reject this.
          avatar: {
            type: 'image',
            value: 'file:///Docs2/contact-sibling-prefix-avatar.jpg',
          },
        }),
      ],
      profileAvatar: {
        type: 'image',
        value: 'file:///etc/passwd',
      },
      documentDirectory: 'file:///Docs/',
    })

    expect(sources).toEqual([])
  })

  it('skips avatars that are markers, emoji, or none', () => {
    const sources = collectLocalAvatarSources({
      contacts: [
        makeContact({
          id: 'emoji',
          avatar: { type: 'emoji', value: '🌱' },
        }),
        makeContact({
          id: 'none',
          avatar: { type: 'none', value: '' },
        }),
        makeContact({
          id: 'marker',
          avatar: { type: 'image', value: 'icloud://contact-marker' },
        }),
        makeContact({
          id: 'absent',
          // Never picked an avatar at all.
        }),
      ],
      profileAvatar: { type: 'emoji', value: '🕊️' },
      documentDirectory: 'file:///Docs/',
    })

    expect(sources).toEqual([])
  })
})

describe('collectExpectedMarkerSources', () => {
  it('returns a contact source for each contact carrying a marker', () => {
    const sources = collectExpectedMarkerSources({
      contacts: [
        makeContact({
          id: 'abc',
          avatar: { type: 'image', value: 'icloud://contact-abc' },
        }),
      ],
      profileAvatar: { type: 'none', value: '' },
      documentDirectory: 'file:///Docs/',
    })

    expect(sources).toEqual([
      {
        kind: 'contact',
        id: 'abc',
        localPath: 'file:///Docs/contact-abc-avatar.jpg',
      },
    ])
  })

  it('returns a profile source when the profile avatar carries the profile marker', () => {
    const sources = collectExpectedMarkerSources({
      contacts: [],
      profileAvatar: { type: 'image', value: 'icloud://profile' },
      documentDirectory: 'file:///Docs/',
    })

    expect(sources).toEqual([
      { kind: 'profile', localPath: 'file:///Docs/profile-avatar.jpg' },
    ])
  })

  it('skips local-file avatars, emoji, and none avatars', () => {
    const sources = collectExpectedMarkerSources({
      contacts: [
        makeContact({
          id: 'local',
          avatar: {
            type: 'image',
            value: 'file:///Docs/contact-local-avatar.jpg?t=7',
          },
        }),
        makeContact({
          id: 'emoji',
          avatar: { type: 'emoji', value: '🌱' },
        }),
      ],
      profileAvatar: {
        type: 'image',
        value: 'file:///Docs/profile-avatar.jpg?t=1',
      },
      documentDirectory: 'file:///Docs/',
    })

    expect(sources).toEqual([])
  })
})

describe('applyDownloadedAvatars', () => {
  it('rewrites contact avatar.value for each downloaded contact', () => {
    const contacts: Contact[] = [
      makeContact({
        id: 'abc',
        avatar: { type: 'image', value: 'icloud://contact-abc' },
      }),
      makeContact({
        id: 'untouched',
        avatar: { type: 'emoji', value: '🌱' },
      }),
    ]
    const result = applyDownloadedAvatars({
      contacts,
      profileAvatar: { type: 'none', value: '' },
      downloaded: [
        {
          kind: 'contact',
          id: 'abc',
          localUri: 'file:///Docs/contact-abc-avatar.jpg?t=99',
        },
      ],
    })

    expect(result.contacts[0].avatar).toEqual({
      type: 'image',
      value: 'file:///Docs/contact-abc-avatar.jpg?t=99',
    })
    expect(result.contacts[1]).toBe(contacts[1])
    expect(result.profileAvatar).toEqual({ type: 'none', value: '' })
  })

  it('rewrites the profile avatar when profile was downloaded', () => {
    const result = applyDownloadedAvatars({
      contacts: [],
      profileAvatar: { type: 'image', value: 'icloud://profile' },
      downloaded: [
        {
          kind: 'profile',
          localUri: 'file:///Docs/profile-avatar.jpg?t=99',
        },
      ],
    })

    expect(result.profileAvatar).toEqual({
      type: 'image',
      value: 'file:///Docs/profile-avatar.jpg?t=99',
    })
  })

  it('does not mutate `updatedAt` on the rewritten contact', () => {
    const contact = makeContact({
      id: 'abc',
      avatar: { type: 'image', value: 'icloud://contact-abc' },
      updatedAt: 12345,
    })
    const result = applyDownloadedAvatars({
      contacts: [contact],
      profileAvatar: { type: 'none', value: '' },
      downloaded: [
        {
          kind: 'contact',
          id: 'abc',
          localUri: 'file:///Docs/contact-abc-avatar.jpg?t=99',
        },
      ],
    })

    // updatedAt must stay the same — the avatar.value rewrite is a display
    // fix-up, not a user edit. If we bumped it, the next push would overwrite
    // the remote with a marker→file:// flip and trigger a no-op churn loop
    // across devices.
    expect(result.contacts[0].updatedAt).toBe(12345)
  })

  it('returns the original arrays unchanged when downloaded list is empty', () => {
    const contacts = [makeContact({ id: 'abc' })]
    const profileAvatar: ProfileAvatar = { type: 'none', value: '' }
    const result = applyDownloadedAvatars({
      contacts,
      profileAvatar,
      downloaded: [],
    })

    expect(result.contacts).toBe(contacts)
    expect(result.profileAvatar).toBe(profileAvatar)
  })
})
