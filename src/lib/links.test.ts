import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openURL: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('expo-linking', () => ({ openURL: mocks.openURL }))
vi.mock('react-native', () => ({ Alert: { alert: mocks.alert } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: mocks.capture },
}))

import { linkOrigin, openURL } from '@/lib/links'

const appleUrl = 'https://maps.apple.com/?q=12%20Example%20St%20%234%20Faketown'
const googleUrl =
  'https://www.google.com/maps/search/?api=1&query=12%20Example%20St%20%234%20Faketown'
const unableToOpen = (url: string) =>
  Promise.reject(new Error(`Unable to open URL: ${url}`))

const reported = () =>
  mocks.capture.mock.calls
    .map(([error, properties]) =>
      [(error as Error).message, (error as Error).stack, properties]
        .map((part) => JSON.stringify(part))
        .join(' ')
    )
    .join(' ')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openURL', () => {
  it('opens the link', async () => {
    mocks.openURL.mockResolvedValue(true)
    await expect(openURL(appleUrl)).resolves.toBe(true)
    expect(mocks.openURL).toHaveBeenCalledWith(appleUrl)
    expect(mocks.alert).not.toHaveBeenCalled()
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('alerts and reports only the scheme and host when it fails', async () => {
    mocks.openURL.mockImplementation(unableToOpen)
    await expect(
      openURL(appleUrl, { alert: { title: 'couldNotOpenMaps' } })
    ).resolves.toBe(false)
    expect(mocks.alert).toHaveBeenCalledWith(
      'couldNotOpenMaps',
      'failedToOpenLink_description',
      undefined
    )
    expect(mocks.capture).toHaveBeenCalledOnce()
    expect(reported()).toContain('https://maps.apple.com')
    expect(reported()).not.toContain('Example')
    expect(reported()).not.toContain('?q=')
  })

  it('never reports a phone number', async () => {
    mocks.openURL.mockImplementation(unableToOpen)
    await openURL('tel:+15555550100')
    await openURL('sms:+15555550100')
    expect(mocks.capture).toHaveBeenCalledTimes(2)
    expect(reported()).toContain('tel:')
    expect(reported()).not.toContain('5555550100')
  })

  it('tries the fallback before alerting', async () => {
    mocks.openURL
      .mockImplementationOnce(unableToOpen)
      .mockResolvedValueOnce(true)
    await expect(openURL(appleUrl, { fallbackUrl: googleUrl })).resolves.toBe(
      true
    )
    expect(mocks.openURL).toHaveBeenNthCalledWith(2, googleUrl)
    expect(mocks.alert).not.toHaveBeenCalled()
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('alerts once when the fallback fails too', async () => {
    mocks.openURL.mockImplementation(unableToOpen)
    await expect(openURL(appleUrl, { fallbackUrl: googleUrl })).resolves.toBe(
      false
    )
    expect(mocks.openURL).toHaveBeenCalledTimes(2)
    expect(mocks.alert).toHaveBeenCalledOnce()
    expect(mocks.capture).toHaveBeenCalledOnce()
    expect(reported()).toContain('https://www.google.com')
    expect(reported()).not.toContain('Example')
  })
})

describe('linkOrigin', () => {
  it('keeps the scheme and host only', () => {
    expect(linkOrigin(appleUrl)).toBe('https://maps.apple.com')
    expect(linkOrigin('https://user:secret@example.com/a?b#c')).toBe(
      'https://example.com'
    )
    expect(linkOrigin('mailto:someone@example.com')).toBe('mailto:')
    expect(linkOrigin('12 Example St')).toBe('[link]')
  })
})
