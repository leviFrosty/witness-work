import Purchases from 'react-native-purchases'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'
import { accountSessions, onAccountChange } from '@/lib/serverAccount'
import {
  createRevenueCatLink,
  type RevenueCatLinkOutcome,
  type RevenueCatLinkReason,
} from '@/lib/serverAccount/revenueCatLink'

let _store: MMKV | null = null

const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const KEY = 'revenuecat-link'

export const PAID_CALL_LINK_WAIT_MS = 5_000

type LinkedListener = (status: {
  supporter: boolean
  expiresAt: number | null
}) => void

const linkedListeners = new Set<LinkedListener>()

export const onRevenueCatLinked = (listener: LinkedListener): (() => void) => {
  linkedListeners.add(listener)
  return () => {
    linkedListeners.delete(listener)
  }
}

export const revenueCatLink = createRevenueCatLink({
  baseUrl: apis.accounts,
  request: (options) => accountSessions.request(options),
  currentAccount: async () => {
    await accountSessions.ready()
    return accountSessions.snapshot()?.accountId ?? null
  },
  openAccount: async () => (await accountSessions.ensure()).accountId,
  appUserId: async () => {
    if (!(await Purchases.isConfigured())) return null
    return Purchases.getAppUserID()
  },
  storage: {
    get: () => store().getString(KEY) ?? null,
    set: (value) => (value ? store().set(KEY, value) : store().delete(KEY)),
  },
  now: Date.now,
  onOutcome: (outcome: RevenueCatLinkOutcome, reason: RevenueCatLinkReason) => {
    if (outcome.result !== 'skipped' && outcome.result !== 'no_session')
      logger.debug(`[account] revenuecat link (${reason}): ${outcome.result}`)
    if (outcome.result === 'linked')
      for (const listener of linkedListeners)
        listener({ supporter: outcome.supporter, expiresAt: outcome.expiresAt })
  },
  onError: (error) => errorTracking.captureException(error),
})

export const ensureRevenueCatLinked = (options: {
  force?: boolean
  reason: RevenueCatLinkReason
}) => revenueCatLink.ensure(options)

export const linkBeforePaidCall = async (): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    revenueCatLink.ensure({ open: true, reason: 'paid_call' }),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, PAID_CALL_LINK_WAIT_MS)
    }),
  ])
  clearTimeout(timer)
}

export const relinkAfterSupporterRefusal = async (): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const outcome = await Promise.race([
    revenueCatLink.ensure({ force: true, open: true, reason: 'refused' }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PAID_CALL_LINK_WAIT_MS)
    }),
  ])
  clearTimeout(timer)
  return outcome?.result === 'linked' && outcome.supporter
}

onAccountChange((change) => {
  void revenueCatLink.ensure(
    change === 'session_opened'
      ? { open: true, reason: 'session_opened' }
      : { force: true, reason: 'account_changed' }
  )
})
