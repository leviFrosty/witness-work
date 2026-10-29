import { beforeEach, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: 'ios',
  access: 'limited' as 'all' | 'limited' | 'none',
  launch: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///system.jpg', width: 1, height: 1 }],
  })),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return native.platform
    },
  },
}))
vi.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: vi.fn(async () => ({
    accessPrivileges: native.access,
  })),
  launchImageLibraryAsync: native.launch,
}))

const { pickLibraryImages } = await import('./pickLibraryImages')

const shared = { uri: 'file:///shared.jpg', width: 2, height: 2 }

beforeEach(() => {
  native.platform = 'ios'
  native.access = 'limited'
  native.launch.mockClear()
})

it('shows only the shared photos with limited access', async () => {
  const chooseShared = vi.fn(async () => [shared])
  const result = await pickLibraryImages(
    { allowsMultipleSelection: true, selectionLimit: 5, exif: true },
    chooseShared
  )
  expect(chooseShared).toHaveBeenCalledWith({ selectionLimit: 5, exif: true })
  expect(native.launch).not.toHaveBeenCalled()
  expect(result).toEqual({ canceled: false, assets: [shared] })
})

it('picks one photo unless several are allowed', async () => {
  const chooseShared = vi.fn(async () => [shared])
  await pickLibraryImages({ selectionLimit: 5 }, chooseShared)
  expect(chooseShared).toHaveBeenCalledWith({ selectionLimit: 1, exif: false })
})

it('backs out like the system picker when nothing is picked', async () => {
  const result = await pickLibraryImages({}, async () => null)
  expect(result).toEqual({ canceled: true, assets: null })
})

it('uses the system picker with full access, none asked, or on Android', async () => {
  const chooseShared = vi.fn(async () => [shared])
  for (const [platform, access] of [
    ['ios', 'all'],
    ['ios', 'none'],
    ['android', 'limited'],
  ] as const) {
    native.platform = platform
    native.access = access
    const result = await pickLibraryImages({}, chooseShared)
    expect(result.assets?.[0]?.uri).toBe('file:///system.jpg')
  }
  expect(chooseShared).not.toHaveBeenCalled()
  expect(native.launch).toHaveBeenCalledTimes(3)
})
