import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  request: vi.fn(),
  services: vi.fn(),
  alert: vi.fn(),
  openSettings: vi.fn(),
}))

vi.mock('react-native', () => ({
  Alert: { alert: mocks.alert },
  Linking: { openSettings: mocks.openSettings },
  Platform: {
    OS: 'ios',
    select: (choices: Record<string, unknown>) =>
      'ios' in choices ? choices.ios : choices.default,
  },
}))
vi.mock('expo-location', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
    DENIED: 'denied',
  },
  getForegroundPermissionsAsync: mocks.get,
  requestForegroundPermissionsAsync: mocks.request,
  hasServicesEnabledAsync: mocks.services,
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import {
  askLocationAccess,
  checkLocationAccess,
  locationFix,
  locationShowsNotice,
  readLocationAccess,
  requestOrOfferLocationSettings,
} from '@/lib/locationPermission'

type Button = { text: string; onPress?: () => void }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requestOrOfferLocationSettings', () => {
  it('resolves true without asking when location is already allowed', async () => {
    mocks.get.mockResolvedValue({ granted: true, canAskAgain: true })
    await expect(requestOrOfferLocationSettings()).resolves.toBe(true)
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.alert).not.toHaveBeenCalled()
  })

  it('shows the system prompt while it still can', async () => {
    mocks.get.mockResolvedValue({ granted: false, canAskAgain: true })
    mocks.request.mockResolvedValue({ granted: false, canAskAgain: false })
    await expect(requestOrOfferLocationSettings()).resolves.toBe(false)
    expect(mocks.request).toHaveBeenCalledOnce()

    expect(mocks.alert).not.toHaveBeenCalled()
  })

  it('offers Settings once the system stops prompting', async () => {
    mocks.get.mockResolvedValue({ granted: false, canAskAgain: false })
    await expect(requestOrOfferLocationSettings()).resolves.toBe(false)
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.alert).toHaveBeenCalledOnce()

    const [title, message, buttons] = mocks.alert.mock.calls[0] as [
      string,
      string,
      Button[],
    ]
    expect(title).toBe('locationSharingDisabled')
    expect(message).toBe('locationSettings_description')
    expect(buttons.map((button) => button.text)).toEqual([
      'cancel',
      'locationDisabled_callToAction',
    ])
    buttons[1].onPress?.()
    expect(mocks.openSettings).toHaveBeenCalledOnce()
  })
})

const permission = (
  status: 'granted' | 'undetermined' | 'denied',
  canAskAgain = true,
  extra: object = {}
) =>
  ({
    status,
    granted: status === 'granted',
    canAskAgain,
    expires: 'never',
    ...extra,
  }) as Parameters<typeof readLocationAccess>[0]['permission']

const read = (
  given: ReturnType<typeof permission>,
  options: Partial<{
    servicesOn: boolean
    promptsAfterDenial: boolean
    precise: boolean
  }> = {}
) =>
  readLocationAccess({
    permission: given,
    servicesOn: true,
    promptsAfterDenial: true,
    precise: false,
    ...options,
  })

describe('readLocationAccess', () => {
  it('is granted when the app may use location', () => {
    expect(read(permission('granted'))).toBe('granted')
  })

  it('can ask when nobody has answered the system prompt yet', () => {
    expect(read(permission('undetermined'))).toBe('ask')
  })

  it('can ask again after one Android refusal', () => {
    expect(read(permission('denied', true))).toBe('askAgain')
  })

  it('is denied once the system stops prompting', () => {
    expect(read(permission('denied', false))).toBe('denied')
  })

  it('is denied in a browser, which never prompts again after a refusal', () => {
    expect(
      read(permission('denied', true), { promptsAfterDenial: false })
    ).toBe('denied')
  })

  it('is off when location is turned off for the whole device', () => {
    expect(read(permission('granted'), { servicesOn: false })).toBe('off')
    expect(read(permission('undetermined'), { servicesOn: false })).toBe('off')
  })

  it('accepts approximate location unless the feature needs precise', () => {
    const iosReduced = permission('granted', true, {
      ios: { scope: 'whenInUse', accuracy: 'reduced' },
    })
    const androidCoarse = permission('granted', true, {
      android: { accuracy: 'coarse' },
    })
    expect(read(iosReduced)).toBe('granted')
    expect(read(androidCoarse)).toBe('granted')
    expect(read(iosReduced, { precise: true })).toBe('approximate')
    expect(read(androidCoarse, { precise: true })).toBe('approximate')
    expect(
      read(permission('granted', true, { android: { accuracy: 'fine' } }), {
        precise: true,
      })
    ).toBe('granted')
  })
})

describe('locationFix', () => {
  const phone = { settings: true, turnOn: false }
  const android = { settings: true, turnOn: true }
  const browser = { settings: false, turnOn: false }

  it('shows the system prompt while it still can', () => {
    expect(locationFix('ask', phone)).toBe('prompt')
    expect(locationFix('askAgain', android)).toBe('prompt')
  })

  it('opens the app settings once the system stops prompting', () => {
    expect(locationFix('denied', phone)).toBe('settings')
    expect(locationFix('approximate', android)).toBe('settings')
  })

  it('turns device location on where the system can', () => {
    expect(locationFix('off', android)).toBe('turnOn')
    expect(locationFix('off', phone)).toBe('settings')
  })

  it('offers nothing a browser cannot do', () => {
    expect(locationFix('denied', browser)).toBeNull()
    expect(locationFix('ask', browser)).toBe('prompt')
  })

  it('needs no fix when location works', () => {
    expect(locationFix('granted', phone)).toBeNull()
    expect(locationFix(null, phone)).toBeNull()
  })
})

describe('locationShowsNotice', () => {
  it('stays quiet until the system prompt has had its turn', () => {
    expect(locationShowsNotice({ access: 'ask', declined: false })).toBe(false)
    expect(locationShowsNotice({ access: 'ask', declined: true })).toBe(true)
  })

  it('stays quiet while unknown or granted', () => {
    expect(locationShowsNotice({ access: null, declined: true })).toBe(false)
    expect(locationShowsNotice({ access: 'granted', declined: true })).toBe(
      false
    )
  })

  it('shows whenever location cannot work without the user', () => {
    for (const access of ['askAgain', 'denied', 'approximate', 'off'] as const)
      expect(locationShowsNotice({ access, declined: false })).toBe(true)
  })
})

describe('checkLocationAccess', () => {
  it('reads permission and device location without prompting', async () => {
    mocks.get.mockResolvedValue(permission('denied', false))
    mocks.services.mockResolvedValue(true)
    await expect(checkLocationAccess()).resolves.toBe('denied')
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('reports device location being off', async () => {
    mocks.get.mockResolvedValue(permission('granted'))
    mocks.services.mockResolvedValue(false)
    await expect(checkLocationAccess()).resolves.toBe('off')
  })

  it('treats a failed check as denied', async () => {
    mocks.get.mockRejectedValue(new Error('unavailable'))
    mocks.services.mockResolvedValue(true)
    await expect(checkLocationAccess()).resolves.toBe('denied')
  })
})

describe('askLocationAccess', () => {
  it('shows one system prompt for overlapping requests', async () => {
    let answer: (value: unknown) => void = () => undefined
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    mocks.services.mockResolvedValue(true)
    const first = askLocationAccess()
    const second = askLocationAccess({ precise: true })
    answer(
      permission('granted', true, {
        ios: { scope: 'whenInUse', accuracy: 'reduced' },
      })
    )
    await expect(first).resolves.toBe('granted')
    await expect(second).resolves.toBe('approximate')
    expect(mocks.request).toHaveBeenCalledOnce()
  })
})
