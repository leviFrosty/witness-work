import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  setString: vi.fn(async () => true),
  share: vi.fn(async () => ({ action: 'sharedAction' })),
  openURL: vi.fn(async () => undefined),
}))

vi.mock('react-native', () => ({
  Share: {
    share: mocks.share,
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
  },
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setString }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/links', () => ({ openURL: mocks.openURL }))
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
  mocks.share.mockResolvedValue({ action: 'sharedAction' })
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
      { method: 'share', source: 'report_screen' }
    )
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
      { method: 'hourglass', source: 'context_menu' }
    )
  })
})
