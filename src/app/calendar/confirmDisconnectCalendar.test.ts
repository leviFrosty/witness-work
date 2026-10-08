import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/app/calendar/calendarSync', () => ({
  calendarAction: vi.fn((action: () => Promise<void>) => action()),
  disconnectCalendar: vi.fn(async () => undefined),
}))

import { Alert, type AlertButton } from 'react-native'
import { disconnectCalendar } from '@/app/calendar/calendarSync'
import { confirmDisconnectCalendar } from '@/app/calendar/confirmDisconnectCalendar'

function shown() {
  const [title, message, buttons] = vi.mocked(Alert.alert).mock.calls[0]
  return { title, message, buttons: buttons as AlertButton[] }
}

describe('Turn Off Calendar Sync alert', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks the primary whether to keep or remove the events', () => {
    confirmDisconnectCalendar({ isPrimary: true, source: 'settings' })
    const { title, message, buttons } = shown()
    expect([title, message]).toEqual([
      'calendarTurnOffTitle',
      'calendarTurnOffChoice',
    ])
    expect(buttons.map((b) => b.text)).toEqual([
      'cancel',
      'calendarKeepEvents',
      'calendarRemoveEvents',
    ])
    buttons[2].onPress!()
    expect(disconnectCalendar).toHaveBeenCalledWith(true, 'settings')
  })

  it("doesn't offer removing the events where it can't", () => {
    confirmDisconnectCalendar({ isPrimary: false, source: 'tray' })
    const { message, buttons } = shown()
    expect(message).toBe('calendarTurnOffKeepsEvents')
    expect(buttons.map((b) => b.text)).toEqual(['cancel', 'calendarTurnOff'])
    buttons[1].onPress!()
    expect(disconnectCalendar).toHaveBeenCalledWith(false, 'tray')
  })
})
