import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PurchasesPackage } from 'react-native-purchases'

const storage = vi.hoisted(() => new Map<string, string>())
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString = (key: string) => storage.get(key)
    set = (key: string, value: string) => storage.set(key, value)
    delete = (key: string) => storage.delete(key)
  },
}))

import {
  clearWebCheckoutRecord,
  readWebCheckoutRecord,
  saveWebCheckoutRecord,
  webCheckoutUrl,
} from '@/features/supporter/lib/webCheckout'

const pkg = (offering: string, identifier: string) =>
  ({
    identifier,
    offeringIdentifier: offering,
    presentedOfferingContext: { offeringIdentifier: offering },
  }) as unknown as PurchasesPackage

const links = new Map([
  ['Monthly $3.99', 'sandbox/mon399'],
  ['One Time $4.99', 'sandbox/tip499'],
])
const ID = 'ww_buyer_0123456789'

beforeEach(() => storage.clear())

describe('webCheckoutUrl', () => {
  const base = {
    links,
    appUserId: ID,
    origin: 'https://app-dev.witnesswork.app',
    variant: 'development',
  } as const

  it('opens the offering’s link as the customer, back to the config’s host', () => {
    expect(
      webCheckoutUrl({ ...base, pkg: pkg('Monthly $3.99', '$rc_monthly') })
    ).toBe(
      `https://pay.rev.cat/sandbox/mon399/${ID}?package_id=%24rc_monthly&hide_back_button=true&skip_purchase_success=true`
    )
  })

  it('adds the return key off the return host, and encodes the package', () => {
    expect(
      webCheckoutUrl({
        ...base,
        origin: 'http://localhost:8081',
        pkg: pkg('One Time $4.99', 'One Time'),
      })
    ).toBe(
      `https://pay.rev.cat/sandbox/tip499/${ID}?package_id=One%20Time&hide_back_button=true&skip_purchase_success=true&utm_content=local`
    )
  })

  it('has no Buy for an offering without a link', () => {
    expect(
      webCheckoutUrl({ ...base, pkg: pkg('Annual $39.99', '$rc_annual') })
    ).toBeNull()
  })

  it.each([null, '$RCAnonymousID:abc123def456', 'short', 'has space id'])(
    'has no Buy for the customer %s',
    (appUserId) => {
      expect(
        webCheckoutUrl({
          ...base,
          appUserId,
          pkg: pkg('Monthly $3.99', '$rc_monthly'),
        })
      ).toBeNull()
    }
  )
})

describe('the checkout record', () => {
  it('keeps only the tier and the time', () => {
    saveWebCheckoutRecord('tip', 1_700_000_000_000)
    expect(JSON.parse(storage.get('record')!)).toEqual({
      tier: 'tip',
      startedAt: 1_700_000_000_000,
    })
    expect(readWebCheckoutRecord()).toEqual({
      tier: 'tip',
      startedAt: 1_700_000_000_000,
    })
    clearWebCheckoutRecord()
    expect(readWebCheckoutRecord()).toBeNull()
  })

  it('drops a damaged record', () => {
    storage.set('record', '{nope')
    expect(readWebCheckoutRecord()).toBeNull()
    storage.set('record', JSON.stringify({ tier: 'gold', startedAt: 1 }))
    expect(readWebCheckoutRecord()).toBeNull()
  })
})
