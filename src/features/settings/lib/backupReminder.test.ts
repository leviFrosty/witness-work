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
  lastiCloudUploadedAt: null,
  uploadConfirmationSupported: true,
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

  it('stays quiet while iCloud has confirmed an upload within the period', () => {
    expect(
      backupReminderDueAt({
        ...base,
        iCloudSyncEnabled: true,
        lastiCloudUploadedAt: daysAgo(2),
      })
    ).toBe(null)
    expect(
      backupReminderDueAt({
        ...base,
        iCloudSyncEnabled: true,
        lastiCloudUploadedAt: daysAgo(60),
      })
    ).not.toBe(null)
  })

  it('still reminds when this device only wrote locally or pulled', () => {
    expect(
      backupReminderDueAt({
        ...base,
        iCloudSyncEnabled: true,
        lastiCloudPushedAt: daysAgo(1),
        lastiCloudPulledAt: daysAgo(1),
        lastiCloudUploadedAt: daysAgo(60),
      })
    ).not.toBe(null)
  })

  it('reminds once sync is off, however recent the upload', () => {
    expect(
      backupReminderDueAt({ ...base, lastiCloudUploadedAt: daysAgo(1) })
    ).not.toBe(null)
  })

  it('counts any recent sync activity on a binary that cannot confirm uploads', () => {
    const legacy = {
      ...base,
      iCloudSyncEnabled: true,
      uploadConfirmationSupported: false,
    }
    expect(
      backupReminderDueAt({ ...legacy, lastiCloudPulledAt: daysAgo(2) })
    ).toBe(null)
    expect(
      backupReminderDueAt({ ...legacy, lastiCloudPushedAt: daysAgo(2) })
    ).toBe(null)
    expect(
      backupReminderDueAt({ ...legacy, lastiCloudPulledAt: daysAgo(60) })
    ).not.toBe(null)
  })

  it('never comes due with reminders off', () => {
    expect(backupReminderDueAt({ ...base, remindMeAboutBackups: false })).toBe(
      null
    )
  })
})
