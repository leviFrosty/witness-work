import { describe, expect, it, vi } from 'vitest'
import type { LocalReminder } from '@/lib/reminderSchedule'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))

vi.mock('@/lib/minutes', () => ({
  formatMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))

import { reminderContent } from '@/lib/reminderContent'

const anchor = new Date('2026-05-01T15:00:00Z')
const visit: LocalReminder = {
  id: 'witness-work-visit-v',
  kind: 'visit',
  targetId: 'v',
  contactId: 'c',
  anchor,
  date: new Date(anchor.getTime() - 2 * 60 * 60_000),
  name: 'Ana',
  note: 'Psalm 37',
}
const options = {
  dataProtectionMode: false,
  timeDisplayFormat: 'short' as const,
}

describe('reminderContent', () => {
  it('words a Follow-up the same way for every path, with a localized lead', () => {
    const content = reminderContent(visit, options)
    expect(content.title).toBe('reminder_title')
    expect(content.body).toContain('visitReminderBody')
    expect(content.body).toContain('"name":"Ana"')
    expect(content.body).toContain('reminderLeadHours {\\"count\\":2}')
    expect(content.body).toContain('Psalm 37')
    expect(content.data).toEqual({
      reminder: { kind: 'visit', id: 'v', contactId: 'c' },
    })
  })

  it('keeps names and topics off the lock screen in data protection mode', () => {
    const content = reminderContent(visit, {
      ...options,
      dataProtectionMode: true,
    })
    expect(content.body).toContain('visitReminderBodyPrivate')
    expect(content.body).not.toContain('Ana')
    expect(content.body).not.toContain('Psalm')
  })

  it('says "now" for a reminder at the start time', () => {
    const content = reminderContent(
      {
        ...visit,
        kind: 'plan',
        targetId: 'p',
        contactId: undefined,
        date: anchor,
        title: 'Cart',
        minutes: 90,
        note: undefined,
      },
      options
    )
    expect(content.title).toBe('Cart')
    expect(content.body).toContain('planReminderBodyNow')
    expect(content.data).toEqual({ reminder: { kind: 'plan', id: 'p' } })
  })
})
