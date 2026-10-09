import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native-purchases', () => ({
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    STORE_PROBLEM_ERROR: '2',
    PURCHASE_NOT_ALLOWED_ERROR: '3',
    PRODUCT_ALREADY_PURCHASED_ERROR: '6',
    NETWORK_ERROR: '10',
    PAYMENT_PENDING_ERROR: '20',
  },
}))

import { storeErrorOutcome } from '@/features/supporter/lib/purchaseErrors'

// RevenueCat errors carry a numeric string code and a readable name.
const rc = (code: string, message = 'store said no') => ({
  code,
  message,
  readableErrorCode: 'SOME_ERROR',
})

describe('storeErrorOutcome', () => {
  it('stays silent when the user cancels the store sheet', () => {
    expect(storeErrorOutcome(rc('1'), 'purchase', 'ios')).toMatchObject({
      silent: true,
      report: false,
    })
  })

  it('explains offline failures without reporting them', () => {
    expect(storeErrorOutcome(rc('10'), 'purchase', 'ios')).toMatchObject({
      silent: false,
      report: false,
      title: 'common_offlineTitle',
      message: 'storeError_offline',
    })
    expect(
      storeErrorOutcome(
        new Error('The Internet connection appears to be offline.'),
        'restore',
        'android'
      )
    ).toMatchObject({ report: false, message: 'storeError_offline' })
  })

  it('treats Ask to Buy as waiting, not failed', () => {
    expect(storeErrorOutcome(rc('20'), 'purchase', 'ios')).toMatchObject({
      report: false,
      title: 'storeError_pendingTitle',
      message: 'storeError_pending',
    })
  })

  it('explains purchase restrictions', () => {
    expect(storeErrorOutcome(rc('3'), 'purchase', 'ios')).toMatchObject({
      report: false,
      message: 'storeError_notAllowed',
    })
  })

  it('offers Restore Purchases for something already bought', () => {
    expect(storeErrorOutcome(rc('6'), 'purchase', 'ios')).toMatchObject({
      report: false,
      offerRestore: true,
      message: 'storeError_alreadyPurchased',
    })
  })

  it.each([
    ['ios', 'storeError_storeProblem'],
    ['android', 'storeError_storeProblemAndroid'],
  ] as const)('names the %s store when it has trouble', (platform, message) => {
    expect(storeErrorOutcome(rc('2'), 'purchase', platform)).toMatchObject({
      report: true,
      message,
    })
  })

  it('reports anything unexpected, with a restore-specific message', () => {
    expect(storeErrorOutcome(rc('99'), 'purchase', 'ios')).toMatchObject({
      report: true,
      title: 'storeError_purchaseFailedTitle',
      message: 'errorCheckingOut',
    })
    expect(
      storeErrorOutcome(new Error('boom'), 'restore', 'ios')
    ).toMatchObject({
      report: true,
      title: 'error_restoring_account',
      message: 'storeError_restoreFailed',
    })
  })
})
