import { describe, expect, it } from 'vitest'
import moment from 'moment'
import {
  autoRescheduleEligibleAt,
  clearAutoRescheduleMetadata,
  computeAutoReschedules,
  contingentNextFollowUpDate,
  isAutoReschedulePaused,
  isFollowUpAutoRescheduleEnabled,
  nextAutoRescheduleDate,
  undoAutoReschedule,
} from '@/lib/autoRescheduleFollowUps'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

const DEFAULT_NOTIF_OFFSET = { amount: 2, unit: 'hours' as const }

const contact = (id: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  name: `Contact ${id}`,
  createdAt: new Date(2026, 0, 1),
  ...extra,
})

const visit = (
  id: string,
  contactId: string,
  date: Date,
  followUp?: Visit['followUp'],
  extra: Partial<Visit> = {}
): Visit => ({
  id,
  contact: { id: contactId },
  date,
  isBibleStudy: false,
  followUp,
  ...extra,
})

describe('autoRescheduleFollowUps', () => {
  it('returns nothing when globally disabled', () => {
    const scheduled = new Date(2026, 10, 7, 10, 0)
    const now = new Date(2026, 10, 9, 10, 0)
    const plans = computeAutoReschedules({
      contacts: [contact('c1')],
      conversations: [
        visit('v1', 'c1', new Date(2026, 9, 31, 10, 0), {
          date: scheduled,
          notifyMe: true,
        }),
      ],
      settings: { enabled: false },
      defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
      now,
    })
    expect(plans).toEqual([])
  })

  it('waits until next morning at 6 AM by default before auto-rescheduling', () => {
    const scheduled = new Date(2026, 10, 7, 10, 0)
    const sameEvening = new Date(2026, 10, 7, 20, 0)
    const nextMorning = new Date(2026, 10, 8, 6, 0)

    const baseArgs = {
      contacts: [contact('c1')],
      conversations: [
        visit('v1', 'c1', new Date(2026, 9, 31, 10, 0), {
          date: scheduled,
          notifyMe: true,
          reminderOffsetMinutes: 30,
        }),
      ],
      settings: { enabled: true },
      defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
    }

    expect(computeAutoReschedules({ ...baseArgs, now: sameEvening })).toEqual(
      []
    )

    const plans = computeAutoReschedules({ ...baseArgs, now: nextMorning })
    expect(plans).toHaveLength(1)
    expect(plans[0].nextDate).toEqual(new Date(2026, 10, 14, 10, 0))
    expect(plans[0].count).toBe(1)
    expect(plans[0].updatedVisit.followUp?.autoRescheduledFrom).toEqual(
      scheduled
    )
    expect(plans[0].updatedVisit.followUp?.autoRescheduledAt).toBe(
      nextMorning.getTime()
    )
    expect(plans[0].updatedVisit.followUp?.notifications?.[0]?.date).toEqual(
      new Date(2026, 10, 14, 9, 30)
    )
  })

  it('supports 4hours and 24hours grace windows', () => {
    const scheduled = new Date(2026, 10, 7, 10, 0)
    expect(autoRescheduleEligibleAt(scheduled, '4hours')).toBe(
      new Date(2026, 10, 7, 14, 0).getTime()
    )
    expect(autoRescheduleEligibleAt(scheduled, '24hours')).toBe(
      new Date(2026, 10, 8, 10, 0).getTime()
    )
    const lateNight = new Date(2026, 10, 7, 3, 0)
    expect(autoRescheduleEligibleAt(lateNight, 'nextMorning')).toBe(
      new Date(2026, 10, 8, 6, 0).getTime()
    )
  })

  it('advances in whole multiples of the interval when multiple cycles elapsed', () => {
    const scheduled = new Date(2026, 10, 7, 10, 30)
    const awayNow = new Date(2026, 10, 25, 14, 0)
    const next = nextAutoRescheduleDate(
      scheduled,
      { amount: 1, unit: 'weeks' },
      awayNow
    )
    expect(next).toEqual(new Date(2026, 10, 28, 10, 30))
  })

  it('preserves local wall-clock time across DST boundaries', () => {
    const beforeSpring = new Date(2026, 2, 7, 10, 0)
    const afterSpring = nextAutoRescheduleDate(
      beforeSpring,
      { amount: 1, unit: 'weeks' },
      new Date(2026, 2, 8, 9, 0)
    )
    expect(afterSpring.getFullYear()).toBe(2026)
    expect(afterSpring.getMonth()).toBe(2)
    expect(afterSpring.getDate()).toBe(14)
    expect(afterSpring.getHours()).toBe(10)
    expect(afterSpring.getMinutes()).toBe(0)

    const beforeFall = new Date(2026, 9, 31, 10, 0)
    const afterFall = nextAutoRescheduleDate(
      beforeFall,
      { amount: 1, unit: 'weeks' },
      new Date(2026, 10, 1, 9, 0)
    )
    expect(afterFall.getFullYear()).toBe(2026)
    expect(afterFall.getMonth()).toBe(10)
    expect(afterFall.getDate()).toBe(7)
    expect(afterFall.getHours()).toBe(10)
    expect(afterFall.getMinutes()).toBe(0)
  })

  it('does not retroactively bump follow-ups that were already eligible before enabledAt', () => {
    const oldMissed = new Date(2026, 10, 1, 10, 0)
    const freshMissed = new Date(2026, 10, 7, 10, 0)
    const enabledAt = new Date(2026, 10, 5, 12, 0).getTime()
    const now = new Date(2026, 10, 8, 9, 0)

    const plans = computeAutoReschedules({
      contacts: [contact('c1'), contact('c2')],
      conversations: [
        visit('v-old', 'c1', new Date(2026, 9, 25), {
          date: oldMissed,
          notifyMe: false,
        }),
        visit('v-new', 'c2', new Date(2026, 9, 31), {
          date: freshMissed,
          notifyMe: false,
        }),
      ],
      settings: { enabled: true, enabledAt },
      defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
      now,
    })

    expect(plans.map((p) => p.visit.id)).toEqual(['v-new'])
  })

  it('stops after the default cap of 2 auto-reschedules unless maxCount is null', () => {
    const scheduled = new Date(2026, 10, 7, 10, 0)
    const now = new Date(2026, 10, 8, 9, 0)
    const twiceBumped = visit('v1', 'c1', new Date(2026, 9, 17), {
      date: scheduled,
      notifyMe: false,
      autoRescheduleCount: 2,
    })

    expect(isAutoReschedulePaused(twiceBumped, 2)).toBe(true)
    expect(isAutoReschedulePaused(twiceBumped, null)).toBe(false)

    expect(
      computeAutoReschedules({
        contacts: [contact('c1')],
        conversations: [twiceBumped],
        settings: { enabled: true, maxCount: 2 },
        defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
        now,
      })
    ).toEqual([])

    const unlimited = computeAutoReschedules({
      contacts: [contact('c1')],
      conversations: [twiceBumped],
      settings: { enabled: true, maxCount: null },
      defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
      now,
    })
    expect(unlimited).toHaveLength(1)
    expect(unlimited[0].count).toBe(3)
  })

  it('skips visits with buddies, per-visit opt-out, dismissed follow-ups, answered visits, or dismissed contacts', () => {
    const scheduled = new Date(2026, 10, 7, 10, 0)
    const now = new Date(2026, 10, 8, 9, 0)

    const conversations: Visit[] = [
      visit('v-buddy', 'c1', new Date(2026, 9, 31), {
        date: scheduled,
        notifyMe: false,
        buddies: ['inbox-1'],
      }),
      visit('v-optout', 'c2', new Date(2026, 9, 31), {
        date: scheduled,
        notifyMe: false,
        autoReschedule: false,
      }),
      visit('v-dismissed', 'c3', new Date(2026, 9, 31), {
        date: scheduled,
        notifyMe: false,
        dismissed: true,
      }),
      visit('v-answered', 'c4', new Date(2026, 9, 31), {
        date: scheduled,
        notifyMe: false,
      }),
      visit('v-answer', 'c4', new Date(2026, 10, 7, 11, 0)),
      visit('v-dismissed-contact', 'c5', new Date(2026, 9, 31), {
        date: scheduled,
        notifyMe: false,
      }),
      visit('v-ok', 'c6', new Date(2026, 9, 31), {
        date: scheduled,
        notifyMe: false,
      }),
    ]

    const contacts: Contact[] = [
      contact('c1'),
      contact('c2'),
      contact('c3'),
      contact('c4'),
      contact('c5', { dismissedUntil: new Date(2026, 11, 1) }),
      contact('c6'),
    ]

    expect(isFollowUpAutoRescheduleEnabled(conversations[0], true)).toBe(false)
    expect(isFollowUpAutoRescheduleEnabled(conversations[1], true)).toBe(false)

    const plans = computeAutoReschedules({
      contacts,
      conversations,
      settings: { enabled: true },
      defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
      now,
    })

    expect(plans.map((p) => p.visit.id)).toEqual(['v-ok'])
  })

  it('reverts cleanly on undo and skips re-bumping that same missed occurrence', () => {
    const scheduled = new Date(2026, 10, 7, 10, 0)
    const now = new Date(2026, 10, 8, 9, 0)
    const original = visit('v1', 'c1', new Date(2026, 9, 31), {
      date: scheduled,
      notifyMe: true,
      reminderOffsetMinutes: 30,
    })

    const [plan] = computeAutoReschedules({
      contacts: [contact('c1')],
      conversations: [original],
      settings: { enabled: true },
      defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
      now,
    })

    const reverted = undoAutoReschedule(plan.updatedVisit, DEFAULT_NOTIF_OFFSET)
    expect(reverted).not.toBeNull()
    expect(reverted!.followUp?.date).toEqual(scheduled)
    expect(reverted!.followUp?.autoRescheduledFrom).toBeUndefined()
    expect(reverted!.followUp?.autoRescheduleCount).toBeUndefined()
    expect(reverted!.followUp?.autoRescheduleSkippedAt).toBe(
      scheduled.getTime()
    )

    const secondPass = computeAutoReschedules({
      contacts: [contact('c1')],
      conversations: [reverted!],
      settings: { enabled: true },
      defaultNotificationOffset: DEFAULT_NOTIF_OFFSET,
      now: moment(now).add(1, 'hour').toDate(),
    })
    expect(secondPass).toEqual([])
  })

  it('clears auto-reschedule metadata on manual edit/reschedule', () => {
    const cleaned = clearAutoRescheduleMetadata({
      date: new Date(2026, 10, 14, 10, 0),
      notifyMe: true,
      autoReschedule: true,
      autoRescheduledFrom: new Date(2026, 10, 7, 10, 0),
      autoRescheduledAt: 123456,
      autoRescheduleCount: 2,
      autoRescheduleSkippedAt: 123456,
    })
    expect(cleaned.autoRescheduledFrom).toBeUndefined()
    expect(cleaned.autoRescheduledAt).toBeUndefined()
    expect(cleaned.autoRescheduleCount).toBeUndefined()
    expect(cleaned.autoRescheduleSkippedAt).toBeUndefined()
    expect(cleaned.autoReschedule).toBe(true)
  })

  it('projects one contingent next-cycle reminder date when notifyMe is enabled', () => {
    const scheduled = new Date(2026, 10, 10, 10, 0)
    const now = new Date(2026, 10, 8, 9, 0)
    const v = visit('v1', 'c1', new Date(2026, 10, 3), {
      date: scheduled,
      notifyMe: true,
    })

    const next = contingentNextFollowUpDate({
      visit: v,
      contactVisits: [v],
      settings: {
        enabled: true,
        offset: { amount: 1, unit: 'weeks' },
        maxCount: 2,
      },
      now,
    })
    expect(next).toEqual(new Date(2026, 10, 17, 10, 0))

    const capped = contingentNextFollowUpDate({
      visit: {
        ...v,
        followUp: { ...v.followUp!, autoRescheduleCount: 2 },
      },
      contactVisits: [v],
      settings: {
        enabled: true,
        offset: { amount: 1, unit: 'weeks' },
        maxCount: 2,
      },
      now,
    })
    expect(capped).toBeNull()
  })
})
