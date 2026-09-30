import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'
import type { ProfileAvatar } from '@/types/avatar'
vi.mock('@/stores/contactsStore', async () => ({
  default: (await import('zustand')).create(() => ({
    contacts: [] as Contact[],
    deletedContacts: [] as Contact[],
  })),
}))
vi.mock('@/stores/profile', async () => ({
  useProfile: (await import('zustand')).create(() => ({
    avatar: { type: 'none', value: '' } as ProfileAvatar,
  })),
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///Docs/',
  deleteAsync: vi.fn(async () => {}),
  readDirectoryAsync: vi.fn(async () => [] as string[]),
}))
import * as FileSystem from 'expo-file-system/legacy'
import useContacts from '@/stores/contactsStore'
import { useProfile } from '@/stores/profile'
import { useLocalAvatarCleanup } from './useLocalAvatarCleanup'
const contact = (id = 'c'): Contact => ({
  id,
  name: 'Contact',
  createdAt: new Date(),
  avatar: { type: 'image', value: `file:///Docs/contact-${id}-avatar.jpg?t=1` },
})
const Harness = () => {
  useLocalAvatarCleanup(true)
  return null
}
let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  vi.clearAllMocks()
  useContacts.setState({ contacts: [contact()], deletedContacts: [] })
  useProfile.setState({ avatar: { type: 'none', value: '' } })
  vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([])
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})
it('removes downloaded bytes after a remote contact deletion', async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    useContacts.setState({
      contacts: [],
      deletedContacts: [{ ...contact(), redacted: true, avatar: undefined }],
    })
  })
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///Docs/contact-c-avatar.jpg',
    { idempotent: true }
  )
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///Docs/contact-c-avatar-original.jpg',
    { idempotent: true }
  )
})
it('keeps the new picker file and its original when only its cache query changes', async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    useContacts.setState({
      contacts: [
        {
          ...contact(),
          avatar: {
            type: 'image',
            value: 'file:///Docs/contact-c-avatar.jpg?t=2',
            revision: 'new',
          },
        },
      ],
    })
  })
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled()
})
it('does not mistake another contact id for a deleted owner during launch cleanup', async () => {
  useContacts.setState({
    contacts: [],
    deletedContacts: [{ ...contact('c'), redacted: true, avatar: undefined }],
  })
  vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([
    'contact-c-avatar-synced.jpg',
    'contact-c-avatar-original.jpg',
    'contact-c-avatar-other-avatar-original.jpg',
  ])
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2)
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
    'file:///Docs/contact-c-avatar-other-avatar-original.jpg',
    expect.anything()
  )
})

it.each(['contact', 'profile'])(
  'keeps the new %s original when replacing a downloaded photo',
  async (kind) => {
    const old: ProfileAvatar = {
      type: 'image',
      value: `file:///Docs/${kind === 'contact' ? 'contact-c' : 'profile'}-avatar-synced-old.jpg`,
      revision: 'old',
    }
    const picked: ProfileAvatar = {
      type: 'image',
      value: `file:///Docs/${kind === 'contact' ? 'contact-c' : 'profile'}-avatar-picked-new.jpg`,
      revision: 'new',
    }
    if (kind === 'contact')
      useContacts.setState({ contacts: [{ ...contact(), avatar: old }] })
    else useProfile.setState({ avatar: old })
    await act(async () => {
      renderer = create(<Harness />)
    })
    await act(async () => {
      if (kind === 'contact')
        useContacts.setState({ contacts: [{ ...contact(), avatar: picked }] })
      else useProfile.setState({ avatar: picked })
    })
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(old.value, {
      idempotent: true,
    })
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
      `file:///Docs/${kind === 'contact' ? 'contact-c' : 'profile'}-avatar-original.jpg`,
      expect.anything()
    )
  }
)

it('keeps the original during same-revision materialization', async () => {
  useContacts.setState({
    contacts: [
      { ...contact(), avatar: { ...contact().avatar!, revision: 'same' } },
    ],
  })
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    useContacts.setState({
      contacts: [
        {
          ...contact(),
          avatar: {
            type: 'image',
            revision: 'same',
            value: 'file:///Docs/contact-c-avatar-synced-same.jpg',
          },
        },
      ],
    })
  })
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
    'file:///Docs/contact-c-avatar-original.jpg',
    expect.anything()
  )
})

it('does not delete a decoded traversal or unrelated document from a remote avatar', async () => {
  useContacts.setState({
    contacts: [
      {
        ...contact(),
        avatar: {
          type: 'image',
          value: 'file:///Docs/%2e%2e/Library/Application%20Support/data',
        },
      },
    ],
  })
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    useContacts.setState({ contacts: [] })
  })
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
    'file:///Docs/%2e%2e/Library/Application%20Support/data',
    expect.anything()
  )
})

it('keeps a pending revision original when a remote photo replaces the saved photo', async () => {
  useContacts.setState({
    contacts: [
      {
        ...contact(),
        avatar: {
          type: 'image',
          value: 'file:///Docs/contact-c-avatar-picked-a.jpg',
          revision: 'a',
        },
      },
    ],
  })
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    useContacts.setState({
      contacts: [
        {
          ...contact(),
          avatar: {
            type: 'image',
            value: 'icloud://contact-c',
            revision: 'remote',
          },
        },
      ],
    })
  })
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///Docs/contact-c-avatar-original-a.jpg',
    { idempotent: true }
  )
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
    'file:///Docs/contact-c-avatar-original-pending.jpg',
    expect.anything()
  )
})

it('preserves archived photos through recovery and erases them after retention redaction', async () => {
  const picked = {
    ...contact(),
    avatar: {
      type: 'image' as const,
      value: 'file:///Docs/contact-c-avatar-picked-a.jpg',
      revision: 'a',
    },
  }
  useContacts.setState({ contacts: [picked] })
  await act(async () => {
    renderer = create(<Harness />)
  })
  await act(async () => {
    useContacts.setState({ contacts: [], deletedContacts: [picked] })
  })
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled()
  await act(async () => {
    useContacts.setState({ contacts: [picked], deletedContacts: [] })
  })
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled()
  await act(async () => {
    useContacts.setState({ contacts: [], deletedContacts: [picked] })
  })
  vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([
    'contact-c-avatar-original-a.jpg',
    'contact-c-avatar-picked-a.jpg',
    'contact-c-avatar-picked-canceled.jpg',
  ])
  await act(async () => {
    useContacts.setState({
      deletedContacts: [{ ...picked, avatar: undefined, redacted: true }],
    })
  })
  for (const file of [
    'contact-c-avatar-original-a.jpg',
    'contact-c-avatar-picked-a.jpg',
    'contact-c-avatar-picked-canceled.jpg',
  ])
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      `file:///Docs/${file}`,
      { idempotent: true }
    )
})

it('keeps recoverable archived files during launch cleanup', async () => {
  const picked = {
    ...contact(),
    avatar: {
      type: 'image' as const,
      value: 'file:///Docs/contact-c-avatar-picked-a.jpg',
      revision: 'a',
    },
  }
  useContacts.setState({ contacts: [], deletedContacts: [picked] })
  vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([
    'contact-c-avatar-picked-a.jpg',
    'contact-c-avatar-original-a.jpg',
  ])
  await act(async () => {
    renderer = create(<Harness />)
  })
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled()
})

it('rechecks original ownership after an earlier local deletion awaited IO', async () => {
  const picked = {
    ...contact(),
    avatar: {
      type: 'image' as const,
      value: 'file:///Docs/contact-c-avatar-picked-a.jpg',
      revision: 'a',
    },
  }
  useContacts.setState({ contacts: [picked] })
  await act(async () => {
    renderer = create(<Harness />)
  })
  let finish: () => void = () => {}
  vi.mocked(FileSystem.deleteAsync).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  await act(async () => {
    useContacts.setState({
      contacts: [
        {
          ...contact(),
          avatar: {
            type: 'image',
            value: 'icloud://contact-c',
            revision: 'remote',
          },
        },
      ],
    })
  })
  await act(async () => {
    useContacts.setState({ contacts: [picked] })
    finish()
  })
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
    'file:///Docs/contact-c-avatar-original-a.jpg',
    expect.anything()
  )
})
