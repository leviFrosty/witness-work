import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { computeAlertVectors } from '@/features/buddies/lib/testing/alertVectors'

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  return { default: i18n }
})

const FILE = join(__dirname, 'alertVectors.json')

describe('named alert vectors', () => {
  it('match the file the iOS extension is tested against', () => {
    const actual = computeAlertVectors()
    // `WRITE_ALERT_VECTORS=1 pnpm vitest run alertVectors` rewrites it.
    if (process.env.WRITE_ALERT_VECTORS)
      writeFileSync(FILE, `${JSON.stringify(actual, null, 2)}\n`)
    expect(JSON.parse(readFileSync(FILE, 'utf8'))).toEqual(actual)
  })

  it('cover every outcome', () => {
    const { cases } = computeAlertVectors()
    const kinds = new Set(
      cases.map(({ outcome }) =>
        'alert' in outcome
          ? outcome.alert.type
          : 'quiet' in outcome
            ? 'quiet'
            : outcome.failed
      )
    )
    expect([...kinds].sort()).toEqual(
      [
        'badge',
        'badgeReaction',
        'claimed',
        'joinRequest',
        'paired',
        'quiet',
        'reply',
        'share',
        'unknownKind',
        'unknownSender',
        'unreadable',
      ].sort()
    )
  })
})
