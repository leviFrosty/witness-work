import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  return { default: i18n }
})
import { settingsDetailScreens } from '@/app/navigation/settingsDetailScreens'
import {
  filterAvailableSettingsSearchItems,
  normalizeSearchText,
  SETTINGS_SEARCH_ITEMS,
  SETTINGS_SEARCH_PAGES,
  searchSettings,
  settingsSearchLocation,
  settingsSearchPath,
  type SettingsSearchAvailability,
  type SettingsSearchItem,
} from '@/features/settings/lib/settingsSearch'

const ids = (query: string, items?: readonly SettingsSearchItem[]) =>
  searchSettings(query, items).map((item) => item.id)

const everything: SettingsSearchAvailability = {
  ios: true,
  account: true,
  deviceSync: true,
  calendarSync: true,
  pet: true,
  scribeOffered: true,
  scribeOn: true,
  logHoursChoice: true,
  logHoursGoal: true,
  annualGoal: true,
  creditLimit: true,
  timeRollover: true,
  mileage: true,
  routineOn: true,
  dataProtection: true,
  deviceNotifications: true,
  haptics: true,
  otaUpdates: true,
}

describe('searchSettings', () => {
  it('returns nothing for an empty query', () => {
    expect(searchSettings('   ')).toEqual([])
  })

  it('matches titles, the page a setting is on, and its keywords', () => {
    expect(ids('color scheme')[0]).toBe('colorScheme')
    expect(ids('dark mode')).toContain('colorScheme')
    expect(ids('vibration')).toEqual(['haptics'])
    expect(ids('conversations')).toEqual(
      expect.arrayContaining([
        'page:PreferencesConversation',
        'followUpOffset',
        'autoFillAddress',
      ])
    )
  })

  it('needs every word to match somewhere', () => {
    expect(ids('mileage vibration')).toEqual([])
  })

  it('ranks an exact title, then other title matches, before keyword matches', () => {
    expect(ids('mileage').slice(0, 2)).toEqual(['mileage', 'trackMileage'])
    expect(ids('kilometers')).toEqual(['trackMileage', 'mileage'])
  })

  it('ignores case and accents', () => {
    expect(ids('HÁPTICS')[0]).toBe('haptics')
    expect(normalizeSearchText('  Résumé   Plan ')).toBe('resume plan')
  })

  it('falls back to a fuzzy match only when nothing matches exactly', () => {
    expect(ids('hapticks')[0]).toBe('haptics')
    expect(ids('hapt')).not.toContain('page:PreferencesNavigation')
    expect(ids('zz')).toEqual([])
  })
})

describe('filterAvailableSettingsSearchItems', () => {
  it('hides settings whose row is hidden', () => {
    const none = Object.fromEntries(
      Object.keys(everything).map((key) => [key, false])
    ) as unknown as SettingsSearchAvailability
    const available = filterAvailableSettingsSearchItems(none).map(
      (item) => item.id
    )
    expect(available).not.toContain('page:PreferencesWidgets')
    expect(available).not.toContain('mileage')
    expect(available).toContain('trackMileage')
    expect(
      filterAvailableSettingsSearchItems(everything).map((item) => item.id)
    ).toContain('page:PreferencesWidgets')
  })
})

describe('settings search registry', () => {
  it('has unique ids', () => {
    const all = SETTINGS_SEARCH_ITEMS.map((item) => item.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('only opens pages the settings split view can show', () => {
    const detailScreens = new Set<string>(
      settingsDetailScreens.map(({ name }) => name)
    )
    for (const page of Object.keys(SETTINGS_SEARCH_PAGES)) {
      if (page === 'SettingsRoot') continue
      expect(detailScreens).toContain(page)
    }
  })

  it('opens nested pages through their parent', () => {
    expect(settingsSearchPath('PreferencesColorKey')).toEqual([
      'PreferencesPersonalization',
      'PreferencesColorKey',
    ])
    expect(settingsSearchPath('SettingsRoot')).toEqual([])
  })

  it('names where a result lives', () => {
    const followUp = SETTINGS_SEARCH_ITEMS.find(
      (item) => item.id === 'followUpOffset'
    )!
    expect(settingsSearchLocation(followUp)).toEqual([
      'Preferences',
      'Conversations',
    ])
    const page = SETTINGS_SEARCH_ITEMS.find(
      (item) => item.id === 'page:PreferencesConversation'
    )!
    expect(settingsSearchLocation(page)).toEqual(['Preferences'])
  })
})

describe('settings search on the web', () => {
  const web = filterAvailableSettingsSearchItems({
    ...everything,
    ios: false,
    calendarSync: false,
    deviceNotifications: false,
    haptics: false,
    otaUpdates: false,
  }).map((item) => item.id)

  it('leaves out rows the web hides', () => {
    for (const id of [
      'conversationNotification',
      'conversationAlwaysNotify',
      'planNotification',
      'planAlwaysNotify',
      'unloggedDayReminder',
      'monthReportReminder',
      'weekPlanReminder',
      'streakReminders',
      'routineReminder',
      'backupReminder',
      'page:PreferencesBackups',
      'haptics',
      'checkForUpdate',
      'page:PreferencesWidgets',
      'page:PreferencesAppIcon',
      'page:PreferencesCalendar',
    ])
      expect(web).not.toContain(id)
  })

  it('keeps the rows the web shows', () => {
    expect(web).toEqual(
      expect.arrayContaining([
        'playSounds',
        'showStreak',
        'autoFillAddress',
        'meetingDays',
        'anonymousAnalytics',
      ])
    )
  })
})
