import { describe, expect, it, vi } from 'vitest'
import type { SignInNotice } from '@/app/account/signInNotices'

/** The web's rows: the account key changes on a phone only. */
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }))
vi.mock('lucide-react-native', () => ({
  History: () => null,
  MonitorSmartphone: () => null,
  UserRoundKey: () => null,
}))
vi.mock('@/lib/locales', async () => {
  const en = (await import('@/locales/en-US.json'))
    .default as unknown as Record<
    string,
    string | { one: string; other: string }
  >
  return {
    default: {
      t: (key: string, params: Record<string, string | number> = {}) => {
        const value = en[key]
        const text =
          typeof value === 'string'
            ? value
            : params.count === 1
              ? value.one
              : value.other
        return text.replace(/%\{(\w+)\}|\{\{(\w+)\}\}/g, (_, a, b) =>
          String(params[a ?? b])
        )
      },
    },
  }
})

import {
  signInNoticeDescription,
  signInNoticeTitle,
} from '@/app/account/signInNoticeCopy'

const notice = (over: Partial<SignInNotice>): SignInNotice => ({
  id: 'sign_in:session:e1',
  kind: 'session',
  entryKind: 'session.opened',
  at: 0,
  count: 1,
  device: { name: 'Pixel 9 Pro', platform: 'android' },
  method: null,
  actor: null,
  shown: false,
  ...over,
})

describe('sign-in notice copy on the web', () => {
  it('sends the account key change to a phone', () => {
    expect(signInNoticeDescription(notice({}))).toBe(
      'Signed in on Pixel 9 Pro. Not you? Sign it out, then change your account key on your phone.'
    )
    expect(
      signInNoticeDescription(
        notice({ kind: 'passkey', entryKind: 'passkey.added', count: 2 })
      )
    ).toBe(
      'Latest: Passkey added on Pixel 9 Pro. Not you? Remove it, then change your account key on your phone.'
    )
  })

  it('names a device by its platform when its label didn’t open', () => {
    expect(
      signInNoticeDescription(
        notice({ device: { name: null, platform: 'ios' } })
      )
    ).toMatch(/^Signed in on an iPhone or iPad\./)
  })

  it('says how many changes an overflow read got through', () => {
    expect(
      signInNoticeTitle(
        notice({ kind: 'overflow', entryKind: null, count: 250, device: null })
      )
    ).toBe('250+ changes to your account')
  })
})
