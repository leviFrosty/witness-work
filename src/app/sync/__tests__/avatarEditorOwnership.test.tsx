import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'
import type { ProfileAvatar } from '@/types/avatar'

const runtime = vi.hoisted(() => ({
  platform: 'ios',
  revision: 0,
  files: new Set<string>(),
  onChange: vi.fn(),
}))
vi.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Pressable: 'Pressable',
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  Alert: { alert: vi.fn() },
  Image: {
    getSize: (_: string, success: (width: number, height: number) => void) =>
      success(20, 10),
  },
}))
vi.mock('lucide-react-native', () => ({
  Camera: 'Camera',
  Check: 'Check',
  Link: 'Link',
  Trash2: 'Trash2',
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => `revision-${++runtime.revision}`,
}))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///Docs/',
  copyAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    if (!runtime.files.has(from)) throw new Error('Source missing')
    runtime.files.add(to)
  }),
  deleteAsync: vi.fn(async (path: string) => {
    runtime.files.delete(path)
  }),
  readDirectoryAsync: vi.fn(async () =>
    [...runtime.files]
      .filter((path) => path.startsWith('file:///Docs/'))
      .map((path) => path.slice('file:///Docs/'.length))
  ),
  getInfoAsync: vi.fn(async (path: string) => ({
    exists: runtime.files.has(path),
  })),
}))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(async () => {
    runtime.files.add('file:///manipulated.jpg')
    return { uri: 'file:///manipulated.jpg', width: 10, height: 10 }
  }),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///picker.jpg', width: 20, height: 10 }],
  })),
}))
vi.mock('expo-sharing', () => ({ shareAsync: vi.fn() }))
vi.mock('expo-media-library', () => ({
  requestPermissionsAsync: vi.fn(),
  saveToLibraryAsync: vi.fn(),
}))
vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success' },
}))
vi.mock('@tamagui/toast', () => ({
  useToastController: () => ({ show: vi.fn() }),
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'Icon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/IsSupporter', () => ({ default: 'IsSupporter' }))
vi.mock('@/components/AccentColorPicker', () => ({ ACCENT_PRESETS: [] }))
vi.mock('@/components/CustomColorSwatch', () => ({
  default: 'CustomColorSwatch',
}))
vi.mock('@/components/ContactAvatarCropEditor', () => ({
  default: 'CropEditor',
}))
vi.mock('@/contexts/theme', () => ({ default: () => ({ colors: {} }) }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('@/stores/contactsStore', async () => ({
  default: (await import('zustand')).create<{
    contacts: Contact[]
    deletedContacts: Contact[]
    updateContact: (patch: Partial<Contact>) => void
  }>((set) => ({
    contacts: [],
    deletedContacts: [],
    updateContact: (patch) =>
      set((state) => ({
        contacts: state.contacts.map((contact) =>
          contact.id === patch.id ? { ...contact, ...patch } : contact
        ),
      })),
  })),
}))
vi.mock('@/stores/profile', async () => ({
  useProfile: (await import('zustand')).create(() => ({
    avatar: { type: 'none', value: '' } as ProfileAvatar,
  })),
}))

import AvatarPickerContent from '@/components/AvatarPickerContent'
import useContacts from '@/stores/contactsStore'
import { useLocalAvatarCleanup } from '@/app/sync/useLocalAvatarCleanup'
import useContactAvatarActions from '@/features/contacts/hooks/useContactAvatarActions'
import { deleteAvatarFiles } from '@/lib/contactAvatarFiles'
import { Alert } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import ContactAvatarCropEditor from '@/components/ContactAvatarCropEditor'

const original: Contact = {
  id: 'c',
  name: 'Contact',
  createdAt: new Date(),
  avatar: {
    type: 'image',
    value: 'file:///Docs/contact-c-avatar-picked-a.jpg',
    revision: 'a',
  },
  avatarMeta: { width: 20, height: 10 },
}
const remote = {
  ...original,
  avatar: {
    type: 'image' as const,
    value: 'icloud://contact-c',
    revision: 'remote',
  },
}
let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  vi.clearAllMocks()
  runtime.revision = 0
  runtime.files = new Set([
    'file:///picker.jpg',
    original.avatar!.value,
    'file:///Docs/contact-c-avatar-original-a.jpg',
  ])
  useContacts.setState({ contacts: [original], deletedContacts: [] })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

const PickerHarness = () => {
  useLocalAvatarCleanup(true)
  return (
    <AvatarPickerContent
      value={original.avatar!}
      imageFileName='contact-c-avatar.jpg'
      onChange={runtime.onChange}
      onBackgroundChange={vi.fn()}
    />
  )
}

it.each(['ios', 'android'])(
  'keeps a pending picker source through remote replacement on %s',
  async (platform) => {
    runtime.platform = platform
    await act(async () => {
      renderer = create(<PickerHarness />)
    })
    const button = renderer!.root
      .findAllByType(Button)
      .find((node) =>
        node
          .findAllByType(Text)
          .some((text) => text.props.children === 'choosePhoto')
      )!
    await act(async () => {
      await button.props.onPress()
    })
    const editor = renderer!.root.findByType(ContactAvatarCropEditor)
    expect(editor.props.sourceUri).toBe(
      'file:///Docs/contact-c-avatar-original-revision-1.jpg'
    )
    await act(async () => {
      useContacts.setState({ contacts: [remote] })
    })
    expect(runtime.files.has(editor.props.sourceUri)).toBe(true)
    expect(
      runtime.files.has('file:///Docs/contact-c-avatar-original-a.jpg')
    ).toBe(false)
    // A cancelled form's files are still included by explicit erasure.
    runtime.files.add(editor.props.destPath)
    await deleteAvatarFiles('c')
    expect(runtime.files.has(editor.props.sourceUri)).toBe(false)
    expect(runtime.files.has(editor.props.destPath)).toBe(false)
  }
)

it('holds an immutable recrop source while another device changes the saved photo', async () => {
  const ActionsHarness = () => {
    useLocalAvatarCleanup(true)
    const contact = useContacts((state) => state.contacts[0])
    const actions = useContactAvatarActions(contact, true)
    return React.createElement(
      'Actions',
      { ...actions, testID: 'actions' },
      actions.editor
    )
  }
  await act(async () => {
    renderer = create(<ActionsHarness />)
  })
  await act(async () => {
    await renderer!.root.findByProps({ testID: 'actions' }).props.edit()
  })
  const source = renderer!.root.findByType(ContactAvatarCropEditor).props
    .sourceUri
  expect(source).toBe('file:///Docs/contact-c-avatar-original-revision-1.jpg')
  await act(async () => {
    useContacts.setState({ contacts: [remote] })
  })
  expect(
    renderer!.root.findByType(ContactAvatarCropEditor).props.sourceUri
  ).toBe(source)
  expect(runtime.files.has(source)).toBe(true)
})

it('can reset a re-cropped received photo that initially had no metadata', async () => {
  useContacts.setState({ contacts: [{ ...original, avatarMeta: undefined }] })
  const ActionsHarness = () => {
    useLocalAvatarCleanup(true)
    const contact = useContacts((state) => state.contacts[0])
    const actions = useContactAvatarActions(contact, true)
    return React.createElement(
      'Actions',
      { ...actions, testID: 'actions' },
      actions.editor
    )
  }
  await act(async () => {
    renderer = create(<ActionsHarness />)
  })
  await act(async () => {
    await renderer!.root.findByProps({ testID: 'actions' }).props.edit()
  })
  await act(async () => {
    const editor = renderer!.root.findByType(ContactAvatarCropEditor)
    runtime.files.add(editor.props.destPath)
    editor.props.onCropped({
      path: editor.props.destPath,
      width: 10,
      height: 10,
    })
  })
  expect(useContacts.getState().contacts[0].avatarMeta).toMatchObject({
    width: 20,
    height: 10,
  })
  expect(
    renderer!.root.findByProps({ testID: 'actions' }).props.hasOriginal
  ).toBe(true)
  await act(async () => {
    renderer!.root.findByProps({ testID: 'actions' }).props.reset()
    const button = vi
      .mocked(Alert.alert)
      .mock.lastCall![2]!.find((button) => button.text === 'reset')!
    await button.onPress!()
  })
  expect(useContacts.getState().contacts[0].avatar?.revision).toBe('revision-2')
  expect(Alert.alert).not.toHaveBeenCalledWith('error', 'originalUnavailable')
})

it('releases a cancelled picker and rejects its late crop callback', async () => {
  await act(async () => {
    renderer = create(<PickerHarness />)
  })
  const button = renderer!.root
    .findAllByType(Button)
    .find((node) =>
      node
        .findAllByType(Text)
        .some((text) => text.props.children === 'choosePhoto')
    )!
  await act(async () => {
    await button.props.onPress()
  })
  const editor = renderer!.root.findByType(ContactAvatarCropEditor).props
  await act(async () => {
    editor.onClose()
  })
  expect(runtime.files.has(editor.sourceUri)).toBe(false)
  await act(async () => {
    runtime.files.add(editor.destPath)
    editor.onCropped({ path: editor.destPath, width: 10, height: 10 })
  })
  expect(runtime.onChange).not.toHaveBeenCalled()
  expect(runtime.files.has(editor.destPath)).toBe(false)
  expect(runtime.files.has(original.avatar!.value)).toBe(true)
})

it('releases a picker copy that completes after unmount', async () => {
  const fs = await import('expo-file-system/legacy')
  let finish: () => void = () => {}
  vi.mocked(fs.copyAsync).mockImplementationOnce(async ({ to }) => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    runtime.files.add(to)
  })
  await act(async () => {
    renderer = create(<PickerHarness />)
  })
  const button = renderer!.root
    .findAllByType(Button)
    .find((node) =>
      node
        .findAllByType(Text)
        .some((text) => text.props.children === 'choosePhoto')
    )!
  let pick: Promise<void> = Promise.resolve()
  await act(async () => {
    pick = button.props.onPress()
  })
  await act(async () => {
    renderer!.unmount()
    renderer = undefined
    finish()
    await pick
  })
  expect(
    runtime.files.has('file:///Docs/contact-c-avatar-original-revision-1.jpg')
  ).toBe(false)
})

it('keeps committed picker files when the picker unmounts', async () => {
  await act(async () => {
    renderer = create(<PickerHarness />)
  })
  const button = renderer!.root
    .findAllByType(Button)
    .find((node) =>
      node
        .findAllByType(Text)
        .some((text) => text.props.children === 'choosePhoto')
    )!
  await act(async () => {
    await button.props.onPress()
  })
  const editor = renderer!.root.findByType(ContactAvatarCropEditor).props
  await act(async () => {
    runtime.files.add(editor.destPath)
    editor.onCropped({ path: editor.destPath, width: 10, height: 10 })
  })
  await act(async () => {
    renderer!.unmount()
    renderer = undefined
  })
  expect(runtime.onChange).toHaveBeenCalledOnce()
  expect(runtime.files.has(editor.sourceUri)).toBe(true)
  expect(runtime.files.has(editor.destPath)).toBe(true)
})

it('preserves committed files through duplicate completion and delayed close callbacks', async () => {
  await act(async () => {
    renderer = create(<PickerHarness />)
  })
  const button = renderer!.root
    .findAllByType(Button)
    .find((node) =>
      node
        .findAllByType(Text)
        .some((text) => text.props.children === 'choosePhoto')
    )!
  await act(async () => {
    await button.props.onPress()
  })
  const editor = renderer!.root.findByType(ContactAvatarCropEditor).props
  await act(async () => {
    runtime.files.add(editor.destPath)
    editor.onCropped({ path: editor.destPath, width: 10, height: 10 })
  })
  await act(async () => {
    editor.onCropped({ path: editor.destPath, width: 10, height: 10 })
    editor.onClose()
  })
  expect(runtime.onChange).toHaveBeenCalledOnce()
  expect(runtime.files.has(editor.sourceUri)).toBe(true)
  expect(runtime.files.has(editor.destPath)).toBe(true)
})

it('releases an uncommitted re-crop source on cancellation', async () => {
  const ActionsHarness = () => {
    const actions = useContactAvatarActions(original, true)
    return React.createElement(
      'Actions',
      { ...actions, testID: 'actions' },
      actions.editor
    )
  }
  await act(async () => {
    renderer = create(<ActionsHarness />)
  })
  await act(async () => {
    await renderer!.root.findByProps({ testID: 'actions' }).props.edit()
  })
  const editor = renderer!.root.findByType(ContactAvatarCropEditor).props
  await act(async () => {
    editor.onClose()
  })
  expect(runtime.files.has(editor.sourceUri)).toBe(false)
  expect(
    runtime.files.has('file:///Docs/contact-c-avatar-original-a.jpg')
  ).toBe(true)
})
