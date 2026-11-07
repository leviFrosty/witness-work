import { perf } from '@/lib/perf'
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import { invalidateCustomerInfoCache } from '@/lib/revenueCatBrowser'
import Purchases from 'react-native-purchases'
import { errorTracking } from '@/lib/errorTracking'
import { toPurchasesError } from '@/lib/purchasesError'
import debounce from 'lodash/debounce'
import { hasSyncTransport, syncTransport } from '@/lib/syncTransport'
import { cloudSyncOnly } from '@/lib/syncTransport/platform'
import { AccountContext, AccountCtx } from '@/contexts/account'
import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import type { AccountFile } from '@/lib/accountFile'
import { decideAccountReconcile } from '@/lib/accountClaim'
import {
  onPeerAccountClaimsChange,
  peerAccountClaims,
  setOwnAccountClaim,
} from '@/lib/accountClaimRegistry'
import {
  adoptAccountId,
  boundSupporterAccount,
  devAccountFileStaged,
  droppedAccountIds,
  getOrCreateAccountId,
  onDevAccountFileChange,
  getOwnAccountClaim,
  readAccountFile,
  writeAccountFile,
} from '@/lib/account'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import {
  currentSupporterAccount,
  ensureRevenueCatLinked,
  onSupporterAccountSwitched,
} from '@/lib/serverAccount/revenueCatLinkRuntime'
import { revenueCatIsOwn } from '@/lib/revenueCatIdentity'
import { logInRevenueCat } from '@/lib/revenueCatLogIn'
import { isOfflineError } from '@/lib/offlineError'
import { checkICloudIdentity } from '@/lib/iCloudIdentity'
import { InstallIdUnavailableError } from '@/lib/installId'
import { onCompletedPull } from '@/lib/cloudSyncPullSettled'
import {
  clearSettledRevenueCatId,
  currentSettledPull,
  type SettledPull,
  settleRevenueCatId,
} from '@/lib/settledRevenueCatId'

interface Props {}

const logIn = logInRevenueCat

const ownIdOrNull = (): string | null => {
  try {
    return getOrCreateAccountId()
  } catch {
    return null
  }
}

const FOREGROUND_RECONCILE_INTERVAL_MS = 15 * 60_000

const AccountProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const { customer, ready, unavailable, setCustomer } = useCustomer()
  const [accountId, setAccountIdState] = useState<string | null>(() => {
    try {
      return getOrCreateAccountId()
    } catch (error) {
      logger.error('[Account] account id resolution failed', error)

      if (!(error instanceof InstallIdUnavailableError))
        errorTracking.captureException(error)
      return null
    }
  })

  const [iCloudSharingAvailable, setICloudSharingAvailable] = useState(
    () => hasSyncTransport() && syncTransport().isAvailable()
  )

  const customerRef = useRef(customer)
  const readyRef = useRef(ready)
  const unavailableRef = useRef(unavailable)
  useEffect(() => {
    customerRef.current = customer
    readyRef.current = ready
    unavailableRef.current = unavailable
  }, [customer, ready, unavailable])

  const accountIdRef = useRef(accountId)
  const setAccountId = useCallback((id: string) => {
    if (id !== accountIdRef.current) clearSettledRevenueCatId()
    accountIdRef.current = id
    setAccountIdState(id)
  }, [])

  const settle = useCallback(async (pull: SettledPull | null) => {
    if (!cloudSyncOnly() || !pull || !readyRef.current) return
    const id = accountIdRef.current
    if (id === null) return
    const loggedInAs = await Purchases.getAppUserID()

    if (accountIdRef.current !== id || loggedInAs !== id) return
    settleRevenueCatId(id, pull)
  }, [])

  const isRevenueCatAnonymous = useCallback(
    async (): Promise<boolean> =>
      readyRef.current &&
      (accountIdRef.current === null || (await Purchases.isAnonymous())),
    []
  )

  const inFlightRef = useRef(false)
  const queuedReasonRef = useRef<string | null>(null)

  const reconcile = useCallback(
    async (reason: string): Promise<void> => {
      perf.count('account:reconcile')

      const revenueCatConfigured = readyRef.current
      if (!revenueCatConfigured && !unavailableRef.current) return

      if (revenueCatConfigured && customerRef.current === null) return

      if (inFlightRef.current) {
        queuedReasonRef.current ??= reason
        return
      }
      inFlightRef.current = true
      try {
        const account = await currentSupporterAccount()

        if (await isRevenueCatAnonymous()) {
          const id = getOrCreateAccountId()
          clearSettledRevenueCatId()
          const { customerInfo } = await logIn(id)
          const changed = id !== accountIdRef.current
          setAccountId(id)
          setCustomer(customerInfo)
          void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
          logger.log('[Account] identified after launch', { reason })
          if (changed) {
            queuedReasonRef.current = null
            return
          }

          customerRef.current = customerInfo
        }

        const devFile = devAccountFileStaged()
        const fileTransport = devFile || hasSyncTransport()
        const fileTransportReady =
          devFile || (fileTransport && syncTransport().isAvailable())
        if (fileTransport && !fileTransportReady)
          setICloudSharingAvailable(false)

        if (fileTransportReady && !devFile)
          checkICloudIdentity('account_reconcile')
        const current = getOrCreateAccountId()
        if (
          current !== accountIdRef.current ||
          (revenueCatConfigured && !revenueCatIsOwn())
        ) {
          const changed = current !== accountIdRef.current
          clearSettledRevenueCatId()
          if (revenueCatConfigured) {
            const { customerInfo } = await logIn(current)
            setCustomer(customerInfo)
            customerRef.current = customerInfo
          }
          setAccountId(current)
          void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
          logger.log('[Account] re-identified after account id reset', {
            reason,
          })
          errorTracking.addBreadcrumb({
            category: 'account',
            message: `re-identify (${reason})`,
            level: 'info',
          })

          if (changed) return
        }

        const entitled =
          revenueCatConfigured &&
          supporterSinceDate(customerRef.current) !== null
        const own = getOwnAccountClaim(entitled, account)

        setOwnAccountClaim(own)

        let file: AccountFile | null = null
        let fileRead = false
        let scanned = true
        if (fileTransportReady) {
          scanned = devFile || (await syncTransport().waitForInitialScan(5000))
          try {
            const read = await readAccountFile()
            setICloudSharingAvailable(true)
            if (read.pending) {
              logger.log('[Account] deferred (account file downloading)', {
                reason,
              })
              return
            }
            file = read.file
            fileRead = true
          } catch (error) {
            logger.warn('[Account] account file unreadable', {
              reason,
              error: (error as Error).message,
            })
            setICloudSharingAvailable(false)
          }
        }

        const pull = currentSettledPull()
        const action = decideAccountReconcile({
          own,
          file,
          fileRead,
          peers: pull?.peers ?? peerAccountClaims(),
          account,
          dropped: droppedAccountIds(),
        })

        const stillOnAccount = () => {
          if (boundSupporterAccount() === account) return true
          logger.log('[Account] account changed during reconcile', { reason })
          return false
        }

        switch (action.type) {
          case 'claim': {
            if (!file && !scanned) {
              logger.log('[Account] claim deferred (initial scan incomplete)')
              return
            }
            if (!stillOnAccount()) return
            await writeAccountFile(own)
            await settle(pull)
            logger.log('[Account] claimed account file', { reason, entitled })
            errorTracking.addBreadcrumb({
              category: 'account',
              message: `claim (${reason})`,
              level: 'info',
            })
            return
          }
          case 'tag': {
            if (!stillOnAccount()) return
            await writeAccountFile(own)
            logger.log('[Account] tagged account file with its account', {
              reason,
            })
            return
          }
          case 'adopt': {
            clearSettledRevenueCatId()
            if (revenueCatConfigured) {
              const { customerInfo } = await logIn(action.accountId)
              setCustomer(customerInfo)
            }

            adoptAccountId(action.accountId, action.claimedAt, action.account, {
              tagged: action.tagged,
            })
            setAccountId(action.accountId)

            void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
            analytics.capture('account_id_adopted', {
              source: action.source,
              revenuecat: revenueCatConfigured,
            })
            logger.log('[Account] adopted shared account id', {
              reason,
              source: action.source,
            })
            errorTracking.addBreadcrumb({
              category: 'account',
              message: `adopt (${action.source}, ${reason})`,
              level: 'info',
            })
            return
          }
          case 'refresh': {
            if (!revenueCatConfigured) return

            void invalidateCustomerInfoCache()
            const info = await Purchases.getCustomerInfo()
            setCustomer(info)
            const entitledNow = supporterSinceDate(info) !== null

            if (
              file &&
              (entitledNow !== file.entitled ||
                (own.account !== undefined && file.account === undefined)) &&
              stillOnAccount()
            ) {
              await writeAccountFile({ ...own, entitled: entitledNow })
            }
            await settle(pull)
            logger.log('[Account] refreshed entitlement from remote flag', {
              reason,
              entitledNow,
            })
            return
          }
          case 'none':
            await settle(pull)
            return
        }
      } catch (error) {
        if (isOfflineError(error)) {
          logger.warn('[Account] reconcile offline', { reason })
        } else if (error instanceof InstallIdUnavailableError) {
          logger.warn('[Account] account id still unavailable', { reason })
        } else {
          logger.error('[Account] reconcile failed', error)
          errorTracking.captureException(
            toPurchasesError(error, { background: true })
          )
        }
      } finally {
        inFlightRef.current = false
        const queued = queuedReasonRef.current
        queuedReasonRef.current = null
        if (queued) void reconcile(queued)
      }
    },
    [isRevenueCatAnonymous, setAccountId, setCustomer, settle]
  )

  const reconciledIdRef = useRef(accountId)
  useEffect(() => {
    if (reconciledIdRef.current === accountId) return
    reconciledIdRef.current = accountId
    void reconcile('account-id')
  }, [accountId, reconcile])

  const customerKnown = customer !== null
  const entitled = supporterSinceDate(customer) !== null
  useEffect(() => {
    void reconcile('customer-state')
  }, [reconcile, ready, unavailable, customerKnown, entitled])

  useEffect(
    () => onSupporterAccountSwitched(() => void reconcile('account-switched')),
    [reconcile]
  )

  useEffect(() => {
    if (!__DEV__) return
    return onDevAccountFileChange(() => void reconcile('dev-account-file'))
  }, [reconcile])

  useEffect(() => {
    const debouncedReconcile = debounce(
      () => void reconcile('sync-claims'),
      500,
      { leading: true, trailing: true }
    )
    const offClaims = onPeerAccountClaimsChange(debouncedReconcile)
    const offPull = cloudSyncOnly()
      ? onCompletedPull(debouncedReconcile)
      : () => {}
    return () => {
      offClaims()
      offPull()
      debouncedReconcile.cancel()
    }
  }, [reconcile])

  useEffect(() => {
    const retry = (reason: string) =>
      void isRevenueCatAnonymous().then(
        (anonymous) => {
          if (
            anonymous ||
            (readyRef.current &&
              (!revenueCatIsOwn() || accountIdRef.current !== ownIdOrNull()))
          )
            void reconcile(reason)
        },
        () => {}
      )
    const foregroundSub = addForegroundListener(() => retry('foreground'))
    const reconnectSub = addReconnectListener(() => retry('reconnect'))
    return () => {
      foregroundSub.remove()
      reconnectSub.remove()
    }
  }, [isRevenueCatAnonymous, reconcile])

  useEffect(() => {
    if (!hasSyncTransport()) return

    const debouncedReconcile = debounce(
      (reason: string) => void reconcile(reason),
      500,
      { leading: true, trailing: true }
    )
    const remoteSub = syncTransport().addRemoteChangeListener(() => {
      debouncedReconcile('remote-change')
    })
    const availabilitySub = syncTransport().addAvailabilityChangeListener(
      (e) => {
        setICloudSharingAvailable(e.available)
        if (e.available) void reconcile('icloud-available')
      }
    )
    const foregroundSub = addForegroundListener(
      () => void reconcile('foreground'),
      { minIntervalMs: FOREGROUND_RECONCILE_INTERVAL_MS }
    )

    return () => {
      remoteSub.remove()
      availabilitySub.remove()
      foregroundSub.remove()
      debouncedReconcile.cancel()
    }
  }, [reconcile])

  const context: AccountCtx = { accountId, iCloudSharingAvailable }

  return (
    <AccountContext.Provider value={context}>
      {children}
    </AccountContext.Provider>
  )
}

export default AccountProvider
