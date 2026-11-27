import { describe, expect, it } from 'vitest'
import { mergePreferences } from '@/app/sync/preferencesMerge'
import { arrivedSoonAfterOpening } from '@/app/data-protection/followTiming'
import {
  accountDataProtectionChange,
  answeredDataProtection,
  chosenDataProtection,
  keepsAccountDetailsPrivate,
} from '@/lib/dataProtectionAccount'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  syncableValues,
} from '@/lib/syncPreferencePolicy'

type Device = {
  values: Record<string, unknown> & {
    dataProtectionMode: boolean
    dataProtectionAccount: unknown
    dataProtectionAccountAnswered: number | null
  }
  updatedAt: Record<string, number>
}

const device = (dataProtectionMode = false): Device => ({
  values: {
    dataProtectionMode,
    dataProtectionModeSetByUser: false,
    dataProtectionAccount: null,
    dataProtectionAccountAnswered: null,
  },
  updatedAt: {},
})

const choose = (target: Device, on: boolean, at: number, stamp = at) => {
  target.values = { ...target.values, ...chosenDataProtection(on, at) }
  target.updatedAt = { ...target.updatedAt, dataProtectionAccount: stamp }
}

const answer = (target: Device, follow: boolean) => {
  const answered = answeredDataProtection(target.values, follow)
  if (answered) target.values = { ...target.values, ...answered }
}

const pull = (into: Device, from: Device) => {
  const merged = mergePreferences(
    into.values,
    into.updatedAt,
    syncableValues(from.values),
    from.updatedAt,
    NON_SYNCABLE_PREFERENCE_KEYS
  )
  into.values = merged.values as Device['values']
  into.updatedAt = merged.updatedAt
}

const change = (target: Device) => accountDataProtectionChange(target.values)

describe('account-wide data protection mode', () => {
  it('asks another device to turn it on, without turning it on', () => {
    const phone = device()
    const tablet = device()
    choose(phone, true, 100)
    pull(tablet, phone)
    expect(change(tablet)).toEqual({ kind: 'ask', on: true, at: 100 })
    expect(tablet.values.dataProtectionMode).toBe(false)
  })

  it('turns it on when the device follows, and stops asking', () => {
    const phone = device()
    const tablet = device()
    choose(phone, true, 100)
    pull(tablet, phone)
    answer(tablet, true)
    expect(tablet.values).toMatchObject({
      dataProtectionMode: true,
      dataProtectionModeSetByUser: true,
      dataProtectionAccountAnswered: 100,
    })
    pull(tablet, phone)
    expect(change(tablet)).toEqual({ kind: 'none' })
  })

  it('keeps an opt-out through later syncs', () => {
    const phone = device()
    const tablet = device()
    choose(phone, true, 100)
    pull(tablet, phone)
    answer(tablet, false)
    pull(tablet, phone)
    pull(phone, tablet)
    pull(tablet, phone)
    expect(tablet.values.dataProtectionMode).toBe(false)
    expect(change(tablet)).toEqual({ kind: 'none' })
    expect(phone.values.dataProtectionMode).toBe(true)
    expect(change(phone)).toEqual({ kind: 'none' })
  })

  it('asks again after an opt-out when someone makes a new choice', () => {
    const phone = device()
    const tablet = device()
    choose(phone, true, 100)
    pull(tablet, phone)
    answer(tablet, false)
    choose(phone, false, 200)
    choose(phone, true, 300)
    pull(tablet, phone)
    expect(change(tablet)).toEqual({ kind: 'ask', on: true, at: 300 })
  })

  it('asks before turning it off, and never turns it off by syncing', () => {
    const phone = device(true)
    const tablet = device(true)
    choose(phone, false, 100)
    pull(tablet, phone)
    expect(tablet.values.dataProtectionMode).toBe(true)
    expect(change(tablet)).toEqual({ kind: 'ask', on: false, at: 100 })
    answer(tablet, false)
    expect(tablet.values.dataProtectionMode).toBe(true)
    expect(change(tablet)).toEqual({ kind: 'none' })
  })

  it('settles silently on a device that already matches', () => {
    const phone = device()
    const tablet = device(true)
    choose(phone, true, 100)
    pull(tablet, phone)
    expect(change(tablet)).toEqual({ kind: 'settle', at: 100 })
  })

  it('settles concurrent changes on the later one everywhere', () => {
    const phone = device()
    const tablet = device()
    choose(phone, true, 100, 1_000)
    choose(tablet, false, 101, 2_000)
    pull(phone, tablet)
    pull(tablet, phone)
    expect(phone.values.dataProtectionAccount).toEqual({ on: false, at: 101 })
    expect(tablet.values.dataProtectionAccount).toEqual({ on: false, at: 101 })
    expect(change(phone)).toEqual({ kind: 'ask', on: false, at: 101 })
    expect(change(tablet)).toEqual({ kind: 'none' })
  })

  it('keeps which choice a device answered on that device', () => {
    const phone = device()
    const tablet = device()
    choose(phone, true, 100)
    pull(tablet, phone)
    answer(tablet, false)
    pull(phone, tablet)
    expect(phone.values.dataProtectionAccountAnswered).toBe(100)
    expect(syncableValues(tablet.values)).not.toHaveProperty(
      'dataProtectionAccountAnswered'
    )
    expect(syncableValues(tablet.values)).not.toHaveProperty(
      'dataProtectionMode'
    )
  })

  it('ignores a malformed choice from another device', () => {
    for (const dataProtectionAccount of [
      { on: 'yes', at: 1 },
      { on: true },
      { on: true, at: Number.NaN },
      'on',
      null,
    ])
      expect(
        accountDataProtectionChange({
          dataProtectionMode: false,
          dataProtectionAccount,
          dataProtectionAccountAnswered: null,
        })
      ).toEqual({ kind: 'none' })
  })
})

describe('calendar details follow the account', () => {
  it('stay out while this device or the account has it on', () => {
    const check = (local: boolean, account: unknown) =>
      keepsAccountDetailsPrivate({
        dataProtectionMode: local,
        dataProtectionAccount: account,
      })
    expect(check(false, null)).toBe(false)
    expect(check(false, { on: false, at: 1 })).toBe(false)
    expect(check(true, null)).toBe(true)
    expect(check(false, { on: true, at: 1 })).toBe(true)
  })
})

describe('when the prompt is asked', () => {
  it('asks about a change that lands soon after opening the app', () => {
    expect(arrivedSoonAfterOpening(1_000, 1_000 + 5_000)).toBe(true)
    expect(arrivedSoonAfterOpening(1_000, 1_000 + 60_000)).toBe(true)
  })

  it('waits for the next opening for one that lands later', () => {
    expect(arrivedSoonAfterOpening(1_000, 1_000 + 60_001)).toBe(false)
  })
})
