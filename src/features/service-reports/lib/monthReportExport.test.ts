import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  setString: vi.fn(async () => true),
  share: vi.fn(async () => ({ action: 'sharedAction' })),
  openURL: vi.fn(async () => true),
  platform: {
    OS: 'ios',
    select(specifics: Record<string, unknown>) {
      return this.OS in specifics ? specifics[this.OS] : specifics.default
    },
  },
  offline: false,
  alert: vi.fn(),
  foreground: new Set<() => void>(),
}))

vi.mock('react-native', () => ({
  Alert: { alert: mocks.alert },
  Platform: mocks.platform,
  Share: {
    share: mocks.share,
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
  },
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setString }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/links', () => ({ openURL: mocks.openURL }))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => mocks.offline,
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    mocks.foreground.add(listener)
    return { remove: () => mocks.foreground.delete(listener) }
  },
}))
vi.mock('@/stores/preferences', () => ({ usePreferences: {} }))
vi.mock('@/stores/serviceReport', () => ({ default: {} }))
vi.mock('@/stores/categories', () => ({ default: {} }))
vi.mock('@/stores/conversationStore', () => ({ default: {} }))
vi.mock('@/stores/contactsStore', () => ({ default: {} }))
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})

import {
  availableExportMethods,
  exportMonthReport,
} from '@/features/service-reports/lib/monthReportExport'
import type { MonthReportData } from '@/features/service-reports/lib/monthReportData'

const report = (overrides: Partial<MonthReportData> = {}): MonthReportData => ({
  sharedInMinistry: true,
  hours: 30,
  credit: 0,
  creditOverageHours: 0,
  studies: 2,
  hourglassReport: { minutes: 1800, studies: 2, remarks: undefined },
  notes: '',
  defaultNotes: '',
  hasNotesOverride: false,
  isLastMonth: true,
  showHours: true,
  showCredit: true,
  reportAsString: () => 'REPORT',
  ...overrides,
})

const august = { month: 7, year: 2026 }

beforeEach(() => {
  vi.clearAllMocks()
  // August is last month.
  vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))
  mocks.share.mockResolvedValue({ action: 'sharedAction' })
  mocks.openURL.mockResolvedValue(true)
  mocks.platform.OS = 'ios'
  mocks.offline = false
  mocks.foreground.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('availableExportMethods', () => {
  it('offers NW Publisher only for the previous month', () => {
    expect(availableExportMethods({ isLastMonth: true })).toContain(
      'nwpublisher'
    )
    expect(availableExportMethods({ isLastMonth: false })).toEqual([
      'copy',
      'share',
      'hourglass',
    ])
  })
})

describe('exportMonthReport', () => {
  it('copies the report text and records where it came from', async () => {
    const sent = await exportMonthReport(
      'copy',
      report(),
      august,
      'context_menu'
    )
    expect(sent).toBe(true)
    expect(mocks.setString).toHaveBeenCalledWith('REPORT')
    expect(mocks.capture).toHaveBeenCalledWith('service_report_exported', {
      method: 'copy',
      source: 'context_menu',
      report_month: 'previous',
    })
  })

  it('does not count a dismissed share sheet as sent', async () => {
    mocks.share.mockResolvedValue({ action: 'dismissedAction' })
    const sent = await exportMonthReport(
      'share',
      report(),
      august,
      'report_screen'
    )
    expect(sent).toBe(false)
    expect(mocks.capture).toHaveBeenCalledWith(
      'service_report_export_dismissed',
      { method: 'share', source: 'report_screen', report_month: 'previous' }
    )
  })

  it('counts a share as sent on iOS', async () => {
    const sent = await exportMonthReport(
      'share',
      report(),
      august,
      'report_screen'
    )
    expect(sent).toBe(true)
  })

  it("doesn't count an Android share, which can't tell a dismissal", async () => {
    mocks.platform.OS = 'android'
    const sent = await exportMonthReport(
      'share',
      report(),
      august,
      'report_screen'
    )
    expect(sent).toBe(false)
    expect(mocks.capture).toHaveBeenCalledWith('service_report_exported', {
      method: 'share',
      source: 'report_screen',
      report_month: 'previous',
    })
  })

  it("doesn't count Hourglass or NW Publisher when the link fails to open", async () => {
    mocks.openURL.mockResolvedValue(false)
    expect(
      await exportMonthReport('hourglass', report(), august, 'context_menu')
    ).toBe(false)
    expect(
      await exportMonthReport('nwpublisher', report(), august, 'context_menu')
    ).toBe(false)
    expect(mocks.openURL).toHaveBeenCalledTimes(2)
  })

  it('refuses NW Publisher outside the previous month', async () => {
    const sent = await exportMonthReport(
      'nwpublisher',
      report({ isLastMonth: false }),
      august,
      'context_menu'
    )
    expect(sent).toBe(false)
    expect(mocks.openURL).not.toHaveBeenCalled()
  })

  it('opens Hourglass with the month', async () => {
    const sent = await exportMonthReport(
      'hourglass',
      report(),
      august,
      'context_menu'
    )
    expect(sent).toBe(true)
    expect(mocks.openURL).toHaveBeenCalledTimes(1)
    expect(mocks.capture).toHaveBeenCalledWith(
      'service_report_export_requested',
      { method: 'hourglass', source: 'context_menu', report_month: 'previous' }
    )
  })

  describe('opened while offline', () => {
    type Button = { text: string; onPress?: () => void }
    const comeBack = () => [...mocks.foreground].forEach((l) => l())
    const answer = (text: string) => {
      const buttons = mocks.alert.mock.calls.at(-1)?.[2] as Button[]
      buttons.find((button) => button.text === text)?.onPress?.()
    }
    const settled = async (promise: Promise<boolean>) => {
      let value: boolean | undefined
      void promise.then((sent) => (value = sent))
      await Promise.resolve()
      await Promise.resolve()
      return value
    }

    beforeEach(() => {
      mocks.offline = true
    })

    it("asks on return instead of marking it sent, and isn't sent when the user says so", async () => {
      const sent = exportMonthReport(
        'hourglass',
        report(),
        august,
        'report_screen'
      )
      await settled(sent)
      expect(mocks.openURL).toHaveBeenCalledTimes(1)
      expect(mocks.alert).not.toHaveBeenCalled()
      expect(await settled(sent)).toBeUndefined()

      comeBack()
      expect(mocks.alert).toHaveBeenCalledWith(
        'Did your report reach Hourglass?',
        expect.stringContaining('offline'),
        expect.any(Array),
        { cancelable: false }
      )
      answer('Not Sent')

      expect(await sent).toBe(false)
      expect(mocks.foreground.size).toBe(0)
      expect(mocks.capture).toHaveBeenCalledWith(
        'service_report_handoff_confirmed',
        {
          method: 'hourglass',
          source: 'report_screen',
          report_month: 'previous',
          sent: false,
        }
      )
    })

    it('counts it sent when the user confirms', async () => {
      const sent = exportMonthReport(
        'nwpublisher',
        report(),
        august,
        'context_menu'
      )
      await settled(sent)
      comeBack()
      expect(mocks.alert.mock.calls[0][0]).toBe(
        'Did your report reach NW Publisher?'
      )
      answer('Mark as Sent')
      expect(await sent).toBe(true)
    })

    it('treats an earlier unanswered hand-off as not sent', async () => {
      const first = exportMonthReport(
        'hourglass',
        report(),
        august,
        'context_menu'
      )
      await settled(first)
      const second = exportMonthReport(
        'hourglass',
        report(),
        august,
        'context_menu'
      )
      expect(await first).toBe(false)
      comeBack()
      expect(mocks.alert).toHaveBeenCalledTimes(1)
      answer('Mark as Sent')
      expect(await second).toBe(true)
    })
  })

  it('flags a report sent before its month is over', async () => {
    await exportMonthReport(
      'copy',
      report({ isLastMonth: false }),
      { month: 8, year: 2026 },
      'context_menu'
    )
    expect(mocks.capture).toHaveBeenCalledWith('service_report_exported', {
      method: 'copy',
      source: 'context_menu',
      report_month: 'current',
    })
  })
})
