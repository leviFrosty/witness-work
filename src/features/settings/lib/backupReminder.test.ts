import moment from 'moment'
import { describe, expect, it } from 'vitest'

import {
  backupReminderDueAt,
  type BackupReminderInput,
} from '@/features/settings/lib/backupReminder'

const now = Date.parse('2026-09-28T12:00:00.000Z')
const daysAgo = (days: number) => moment(now).subtract(days, 'days').valueOf()
const base: BackupReminderInput = {
  remindMeAboutBackups: true,
  frequencyDays: 30,
  installedOn: daysAgo(400),
  lastBackupDate: null,
  snoozedAt: null,
  iCloudSyncEnabled: false,
  lastiCloudPushedAt: null,
  lastiCloudPulledAt: null,
  now,
}

describe('backupReminderDueAt', () => {
  it('comes due a period after install when there has never been a backup', () => {
    expect(backupReminderDueAt(base)).toBe(
      moment(daysAgo(400)).add(30, 'days').valueOf()
    )
  })

  it('waits a full period after install', () => {
    expect(backupReminderDueAt({ ...base, installedOn: daysAgo(10) })).toBe(
      null
    )
  })

  it('comes due a period after the last backup', () => {
    expect(
      backupReminderDueAt({ ...base, lastBackupDate: new Date(daysAgo(10)) })
    ).toBe(null)
    expect(
      backupReminderDueAt({ ...base, lastBackupDate: new Date(daysAgo(45)) })
    ).toBe(moment(daysAgo(45)).add(30, 'days').valueOf())
  })

  it('reads a last backup date restored from JSON', () => {
    expect(
      backupReminderDueAt({
        ...base,
        lastBackupDate: new Date(daysAgo(10)).toISOString(),
      })
    ).toBe(null)
  })

  it('snoozes a period from the dismissal without counting it as a backup', () => {
    expect(backupReminderDueAt({ ...base, snoozedAt: daysAgo(5) })).toBe(null)
    expect(backupReminderDueAt({ ...base, snoozedAt: daysAgo(31) })).toBe(
      moment(daysAgo(31)).add(30, 'days').valueOf()
    )
  })

  it('stays quiet while iCloud Sync has synced within the period', () => {
    expect(
      backupReminderDueAt({
        ...base,
        iCloudSyncEnabled: true,
        lastiCloudPulledAt: daysAgo(2),
      })
    ).toBe(null)
    expect(
      backupReminderDueAt({
        ...base,
        iCloudSyncEnabled: true,
        lastiCloudPulledAt: daysAgo(60),
      })
    ).not.toBe(null)
  })

  it('never comes due with reminders off', () => {
    expect(backupReminderDueAt({ ...base, remindMeAboutBackups: false })).toBe(
      null
    )
  })
})
