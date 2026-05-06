import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/locales', () => ({
  default: {
    t: vi.fn((key: string) => key),
  },
}))

import { Conversation } from '../types/conversation'
import { sync } from '../lib/conversationReminders'

const makeAdapter = () => ({
  scheduleNotificationAsync: vi.fn(async () => 'fake-id'),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
})

const makeConversation = (
  overrides: Partial<Conversation> = {}
): Conversation => ({
  id: 'conv-1',
  contact: { id: 'contact-1' },
  date: new Date(),
  isBibleStudy: false,
  ...overrides,
})

describe('conversationReminders.sync', () => {
  it('schedules a notification at followUpDate minus offset when creating with notifyMe', async () => {
    const adapter = makeAdapter()
    let scheduledId = 0
    adapter.scheduleNotificationAsync.mockImplementation(async () => {
      scheduledId += 1
      return `scheduled-${scheduledId}`
    })

    const followUpDate = moment().add(1, 'day').toDate()
    const conversation = makeConversation({
      followUp: {
        date: followUpDate,
        notifyMe: true,
        topic: 'Hebrews 11',
      },
    })

    const result = await sync(
      {
        conversation,
        previous: undefined,
        contactName: 'John Doe',
        notifyMeOffset: { amount: 2, unit: 'hours' },
      },
      adapter
    )

    expect(adapter.scheduleNotificationAsync).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('scheduled-1')
    const expectedTrigger = moment(followUpDate).subtract(2, 'hours').toDate()
    expect(result[0].date.getTime()).toBe(expectedTrigger.getTime())
  })

  it('does not schedule when notifyMe is false', async () => {
    const adapter = makeAdapter()
    const conversation = makeConversation({
      followUp: {
        date: moment().add(1, 'day').toDate(),
        notifyMe: false,
      },
    })

    const result = await sync(
      {
        conversation,
        previous: undefined,
        contactName: 'John Doe',
        notifyMeOffset: { amount: 2, unit: 'hours' },
      },
      adapter
    )

    expect(adapter.scheduleNotificationAsync).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('does not schedule when there is no followUp at all', async () => {
    const adapter = makeAdapter()
    const conversation = makeConversation()

    const result = await sync(
      {
        conversation,
        previous: undefined,
        contactName: 'John Doe',
        notifyMeOffset: { amount: 2, unit: 'hours' },
      },
      adapter
    )

    expect(adapter.scheduleNotificationAsync).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('preserves existing notifications when followUp is unchanged', async () => {
    const adapter = makeAdapter()
    const followUpDate = moment().add(1, 'day').toDate()
    const previousNotifications = [
      {
        id: 'kept-1',
        date: moment(followUpDate).subtract(2, 'hours').toDate(),
      },
    ]
    const previous = makeConversation({
      followUp: {
        date: followUpDate,
        notifyMe: true,
        topic: 'Hebrews 11',
        notifications: previousNotifications,
      },
    })
    const conversation = makeConversation({
      followUp: {
        date: followUpDate,
        notifyMe: true,
        topic: 'Hebrews 11',
        notifications: previousNotifications,
      },
    })

    const result = await sync(
      {
        conversation,
        previous,
        contactName: 'John Doe',
        notifyMeOffset: { amount: 2, unit: 'hours' },
      },
      adapter
    )

    expect(adapter.cancelScheduledNotificationAsync).not.toHaveBeenCalled()
    expect(adapter.scheduleNotificationAsync).not.toHaveBeenCalled()
    expect(result).toEqual(previousNotifications)
  })

  it('cancels old notifications and schedules new when followUp changes', async () => {
    const adapter = makeAdapter()
    adapter.scheduleNotificationAsync.mockResolvedValue('new-id')
    const oldFollowUpDate = moment().add(1, 'day').toDate()
    const newFollowUpDate = moment().add(2, 'days').toDate()
    const previousNotifications = [
      { id: 'old-1', date: oldFollowUpDate },
      { id: 'old-2', date: oldFollowUpDate },
    ]
    const previous = makeConversation({
      followUp: {
        date: oldFollowUpDate,
        notifyMe: true,
        notifications: previousNotifications,
      },
    })
    const conversation = makeConversation({
      followUp: {
        date: newFollowUpDate,
        notifyMe: true,
        notifications: previousNotifications,
      },
    })

    const result = await sync(
      {
        conversation,
        previous,
        contactName: 'John Doe',
        notifyMeOffset: { amount: 2, unit: 'hours' },
      },
      adapter
    )

    expect(adapter.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2)
    expect(adapter.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'old-1'
    )
    expect(adapter.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'old-2'
    )
    expect(adapter.scheduleNotificationAsync).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new-id')
    expect(result[0].date.getTime()).toBe(
      moment(newFollowUpDate).subtract(2, 'hours').toDate().getTime()
    )
  })

  it('cancels old notifications and returns empty when followUp removes notifyMe', async () => {
    const adapter = makeAdapter()
    const followUpDate = moment().add(1, 'day').toDate()
    const previousNotifications = [{ id: 'old-1', date: followUpDate }]
    const previous = makeConversation({
      followUp: {
        date: followUpDate,
        notifyMe: true,
        notifications: previousNotifications,
      },
    })
    const conversation = makeConversation({
      followUp: {
        date: followUpDate,
        notifyMe: false,
        notifications: previousNotifications,
      },
    })

    const result = await sync(
      {
        conversation,
        previous,
        contactName: 'John Doe',
        notifyMeOffset: { amount: 2, unit: 'hours' },
      },
      adapter
    )

    expect(adapter.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'old-1'
    )
    expect(adapter.scheduleNotificationAsync).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('does not schedule when the trigger date is already in the past', async () => {
    const adapter = makeAdapter()
    // Follow-up is 1 hour from now, offset is 2 hours -> trigger is 1 hour ago.
    const conversation = makeConversation({
      followUp: {
        date: moment().add(1, 'hour').toDate(),
        notifyMe: true,
      },
    })

    const result = await sync(
      {
        conversation,
        previous: undefined,
        contactName: 'John Doe',
        notifyMeOffset: { amount: 2, unit: 'hours' },
      },
      adapter
    )

    expect(adapter.scheduleNotificationAsync).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })
})
