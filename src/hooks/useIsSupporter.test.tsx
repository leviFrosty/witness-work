import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupporterStatus } from '@/hooks/useIsSupporter'

const runtime = vi.hoisted(() => ({
  customer: null as unknown,
  unavailable: false,
  override: null as string | null,
}))

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/hooks/useCustomer', () => ({
  default: () => ({
    customer: runtime.customer,
    unavailable: runtime.unavailable,
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: unknown) => unknown) =>
    select({ devSupporterOverride: runtime.override }),
}))

const ACCOUNT = 'acct_one'
const SINCE = '2025-02-01T00:00:00.000Z'
const entitled = {
  entitlements: {
    active: {
      'Lifetime Supporter': {
        isActive: true,
        identifier: 'Lifetime Supporter',
        productIdentifier: 'rc_promo_lifetime',
        originalPurchaseDate: SINCE,
      },
    },
  },
  activeSubscriptions: [],
}
const notEntitled = { entitlements: { active: {} } }

const load = async () => {
  const { default: useIsSupporter } = await import('@/hooks/useIsSupporter')
  const { default: SupporterStoreSync } = await import(
    '@/features/supporter/components/SupporterStoreSync'
  )
  const store = await import('@/stores/serverSupporter')
  const { accountFingerprint } = await import(
    '@/lib/serverAccount/serverSupporter'
  )
  const { useSupporter } = await import('@/stores/supporterStatus')
  const answer = (
    supporter: boolean,
    expiresAt: number | null,
    account = ACCOUNT
  ) =>
    store.setServerSupporterEntry({
      account: accountFingerprint(account),
      supporter,
      expiresAt,
      readAt: Date.now(),
    })
  const signInAs = (account: string | null) =>
    store.setServerSupporterAccount(
      account === null ? null : accountFingerprint(account)
    )
  return { useIsSupporter, SupporterStoreSync, answer, signInAs, useSupporter }
}

let renderer: ReactTestRenderer | null = null
let status: SupporterStatus | null = null

const render = async (
  useIsSupporter: () => SupporterStatus,
  SupporterStoreSync: React.FC
) => {
  const Probe = ({ onStatus }: { onStatus: (s: SupporterStatus) => void }) => {
    onStatus(useIsSupporter())
    return null
  }
  await act(async () => {
    renderer = create(
      <>
        <Probe onStatus={(s) => (status = s)} />
        <SupporterStoreSync />
      </>
    )
  })
}

vi.stubGlobal('__DEV__', true)

beforeEach(() => {
  vi.resetModules()
  vi.useRealTimers()
  runtime.customer = notEntitled
  runtime.unavailable = false
  runtime.override = null
  status = null
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.useRealTimers()
})

describe("useIsSupporter's fallback to ww-api's answer", () => {
  it('makes the User a Supporter, without a since date', async () => {
    const m = await load()
    m.signInAs(ACCOUNT)
    m.answer(true, null)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status).toEqual({ isSupporter: true, since: null })
    expect(m.useSupporter.getState().isSupporter).toBe(true)
  })

  it("keeps RevenueCat's answer and date when it says Supporter", async () => {
    runtime.customer = entitled
    const m = await load()
    m.signInAs(ACCOUNT)
    m.answer(false, null)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status).toEqual({ isSupporter: true, since: new Date(SINCE) })
  })

  it('locks again when the answer expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const m = await load()
    m.signInAs(ACCOUNT)
    m.answer(true, Date.now() + 60_000)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status?.isSupporter).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(status?.isSupporter).toBe(false)
    expect(m.useSupporter.getState().isSupporter).toBe(false)
  })

  it("doesn't count an expired answer", async () => {
    const m = await load()
    m.signInAs(ACCOUNT)
    m.answer(true, Date.now() - 1)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status?.isSupporter).toBe(false)
  })

  it('drops another account’s answer, and a signed-out one', async () => {
    const m = await load()
    m.answer(true, null)
    m.signInAs('acct_two')
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status?.isSupporter).toBe(false)

    await act(async () => m.signInAs(null))
    expect(status?.isSupporter).toBe(false)

    await act(async () => m.signInAs(ACCOUNT))
    expect(status?.isSupporter).toBe(true)
  })

  it('trusts the last answer while the session loads', async () => {
    const m = await load()
    m.answer(true, null)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status?.isSupporter).toBe(true)
  })

  it('counts on a device without RevenueCat', async () => {
    runtime.customer = null
    runtime.unavailable = true
    const m = await load()
    m.signInAs(ACCOUNT)
    m.answer(true, null)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status).toEqual({ isSupporter: true, since: null })
    expect(m.useSupporter.getState().isSupporter).toBe(true)
  })

  it('gives way to the dev override', async () => {
    runtime.override = SINCE
    const m = await load()
    m.signInAs(ACCOUNT)
    m.answer(false, null)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(status).toEqual({ isSupporter: true, since: new Date(SINCE) })
  })

  it('the mirror says Supporter before RevenueCat answers', async () => {
    runtime.customer = null
    const m = await load()
    m.signInAs(ACCOUNT)
    m.answer(true, null)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(m.useSupporter.getState().isSupporter).toBe(true)
  })

  it("the mirror doesn't take an answer before the session says whose", async () => {
    runtime.customer = null
    const m = await load()
    m.answer(true, null)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(m.useSupporter.getState().isSupporter).toBe(false)

    await act(async () => m.signInAs(ACCOUNT))
    expect(m.useSupporter.getState().isSupporter).toBe(true)
  })

  it('the mirror reads again for a new account', async () => {
    runtime.customer = entitled
    const m = await load()
    m.signInAs(ACCOUNT)
    await render(m.useIsSupporter, m.SupporterStoreSync)
    expect(m.useSupporter.getState().isSupporter).toBe(true)

    // The switch drops the previous account's mirror (`onAccountSwitched`).
    await act(async () => {
      m.useSupporter.getState().setSupporter(false)
      m.signInAs('acct_two')
    })
    expect(m.useSupporter.getState().isSupporter).toBe(true)
  })
})
