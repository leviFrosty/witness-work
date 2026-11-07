import Purchases from 'react-native-purchases'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'
import {
  accountSessions,
  currentSessionAccount,
  onAccountChange,
} from '@/lib/serverAccount'
import {
  createRevenueCatLink,
  type RevenueCatLinkOutcome,
  type RevenueCatLinkReason,
} from '@/lib/serverAccount/revenueCatLink'
import {
  confirmSupporterAccount,
  createServerSupporter,
} from '@/lib/serverAccount/serverSupporter'
import { addForegroundListener } from '@/lib/appLifecycle'
import {
  adoptedAccountIdFor,
  bindSupporterAccount,
  boundSupporterAccount,
  dropAdoptedAccountId,
  getOrCreateAccountId,
} from '@/lib/account'
import {
  setOwnAccountClaim,
  setPeerAccountClaims,
} from '@/lib/accountClaimRegistry'
import {
  setServerSupporterAccount,
  setServerSupporterEntry,
  useServerSupporter,
} from '@/stores/serverSupporter'
import { useSupporter } from '@/stores/supporterStatus'

let _store: MMKV | null = null

const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const KEY = 'revenuecat-link'

export const PAID_CALL_LINK_WAIT_MS = 5_000

type LinkedListener = (status: {
  supporter: boolean
  expiresAt: number | null

  accountId: string
}) => void

const linkedListeners = new Set<LinkedListener>()

export const onRevenueCatLinked = (listener: LinkedListener): (() => void) => {
  linkedListeners.add(listener)
  return () => {
    linkedListeners.delete(listener)
  }
}

const accountSwitchedListeners = new Set<() => void>()

export const onSupporterAccountSwitched = (
  listener: () => void
): (() => void) => {
  accountSwitchedListeners.add(listener)
  return () => {
    accountSwitchedListeners.delete(listener)
  }
}

const dropPreviousAccount = (previous: string) => {
  logger.log('[account] another account: dropping its Supporter state')
  useSupporter.getState().setSupporter(false)
  setPeerAccountClaims([])
  setOwnAccountClaim(null)
  dropAdoptedAccountId(previous)
}

const bind = (account: string) => {
  bindSupporterAccount(account)
  for (const listener of accountSwitchedListeners) {
    try {
      listener()
    } catch (error) {
      errorTracking.captureException(error)
    }
  }
}

const supporterAccount = {
  store: {
    entry: () => useServerSupporter.getState().entry,
    setEntry: setServerSupporterEntry,
    setAccount: setServerSupporterAccount,
    bound: boundSupporterAccount,
    bind,
    adoptedFor: adoptedAccountIdFor,
  },
  onAccountSwitched: dropPreviousAccount,
}

export const currentSupporterAccount = async (): Promise<string | null> => {
  try {
    const accountId = await currentSessionAccount()
    if (accountId) return confirmSupporterAccount(supporterAccount, accountId)
  } catch {}
  return boundSupporterAccount()
}

const confirmed = (accountId: string | null): string | null => {
  if (accountId) confirmSupporterAccount(supporterAccount, accountId)
  return accountId
}

export const revenueCatLink = createRevenueCatLink({
  baseUrl: apis.accounts,
  request: (options, accountId) =>
    accountSessions.request(options, { accountId }),
  confirmAccount: async () => confirmed(await currentSessionAccount()),
  sessionAccount: () => currentSessionAccount(),
  openAccount: async () => {
    const { accountId } = await accountSessions.ensure()
    confirmed(accountId)
    return accountId
  },
  appUserId: async () => {
    if (!(await Purchases.isConfigured())) return null
    const appUserId = await Purchases.getAppUserID()

    try {
      return appUserId === getOrCreateAccountId() ? appUserId : null
    } catch {
      return null
    }
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
        listener({
          supporter: outcome.supporter,
          expiresAt: outcome.expiresAt,
          accountId: outcome.accountId,
        })
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

export const serverSupporter = createServerSupporter({
  currentAccount: () => currentSessionAccount({ reopenStale: true }),
  link: (reason) => revenueCatLink.ensure({ reason }),
  fetchStatus: (accountId) => revenueCatLink.fetchStatus(accountId),
  ...supporterAccount,
  now: Date.now,
})

onRevenueCatLinked(
  ({ accountId, ...status }) => void serverSupporter.record(accountId, status)
)

onSupporterAccountSwitched(() => void serverSupporter.accountSwitched())

onAccountChange((change) => {
  if (change === 'key_changed') void serverSupporter.accountChanged()
  else void serverSupporter.refresh({ force: true, reason: 'session_opened' })
})

addForegroundListener(
  () => void serverSupporter.refresh({ reason: 'foreground' })
)
void serverSupporter.refresh({ reason: 'launch' })
