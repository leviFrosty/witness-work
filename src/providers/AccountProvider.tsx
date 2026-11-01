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
import Purchases from 'react-native-purchases'
import { errorTracking } from '@/lib/errorTracking'
import { toPurchasesError } from '@/lib/purchasesError'
import debounce from 'lodash/debounce'
import { hasSyncTransport, syncTransport } from '@/lib/syncTransport'
import { AccountContext, AccountCtx } from '@/contexts/account'
import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import { decideAccountAction } from '@/lib/accountFile'
import {
  adoptAccountId,
  getOrCreateAccountId,
  readAccountFile,
  writeAccountFile,
} from '@/lib/account'
import { logger } from '@/lib/logger'
import { ensureRevenueCatLinked } from '@/lib/serverAccount/revenueCatLinkRuntime'
import { isOfflineError } from '@/lib/offlineError'
import { checkICloudIdentity } from '@/lib/iCloudIdentity'
import { InstallIdUnavailableError } from '@/lib/installId'

interface Props {}

const FOREGROUND_RECONCILE_INTERVAL_MS = 15 * 60_000

const AccountProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const { customer, ready, setCustomer } = useCustomer()
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
  useEffect(() => {
    customerRef.current = customer
    readyRef.current = ready
  }, [customer, ready])

  const accountIdRef = useRef(accountId)
  const setAccountId = useCallback((id: string) => {
    accountIdRef.current = id
    setAccountIdState(id)
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
      if (!readyRef.current) return

      if (customerRef.current === null) return

      if (inFlightRef.current) {
        queuedReasonRef.current ??= reason
        return
      }
      inFlightRef.current = true
      try {
        if (await isRevenueCatAnonymous()) {
          const id = getOrCreateAccountId()
          const { customerInfo } = await Purchases.logIn(id)
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

        if (!hasSyncTransport()) return
        if (!syncTransport().isAvailable()) {
          setICloudSharingAvailable(false)
          return
        }

        checkICloudIdentity('account_reconcile')
        const current = getOrCreateAccountId()
        if (current !== accountIdRef.current) {
          const { customerInfo } = await Purchases.logIn(current)
          setAccountId(current)
          setCustomer(customerInfo)
          void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
          logger.log('[Account] re-identified after account id reset', {
            reason,
          })
          errorTracking.addBreadcrumb({
            category: 'account',
            message: `re-identify (${reason})`,
            level: 'info',
          })

          return
        }

        const scanned = await syncTransport().waitForInitialScan(5000)

        let read
        try {
          read = await readAccountFile()
        } catch (error) {
          logger.warn('[Account] account file unreadable', {
            reason,
            error: (error as Error).message,
          })
          setICloudSharingAvailable(false)
          return
        }
        setICloudSharingAvailable(true)
        if (read.pending) {
          logger.log('[Account] deferred (account file downloading)', {
            reason,
          })
          return
        }
        const { file } = read

        const mine = getOrCreateAccountId()
        const entitled = supporterSinceDate(customerRef.current) !== null
        const action = decideAccountAction({ accountId: mine, entitled, file })

        switch (action.type) {
          case 'claim': {
            if (!file && !scanned) {
              logger.log('[Account] claim deferred (initial scan incomplete)')
              return
            }
            await writeAccountFile(mine, entitled)
            logger.log('[Account] claimed account file', { reason, entitled })
            errorTracking.addBreadcrumb({
              category: 'account',
              message: `claim (${reason})`,
              level: 'info',
            })
            return
          }
          case 'adopt': {
            const { customerInfo } = await Purchases.logIn(action.accountId)
            adoptAccountId(action.accountId)
            setAccountId(action.accountId)
            setCustomer(customerInfo)

            void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
            logger.log('[Account] adopted shared account id', { reason })
            errorTracking.addBreadcrumb({
              category: 'account',
              message: `adopt (${reason})`,
              level: 'info',
            })
            return
          }
          case 'refresh': {
            Purchases.invalidateCustomerInfoCache()
            const info = await Purchases.getCustomerInfo()
            setCustomer(info)
            const entitledNow = supporterSinceDate(info) !== null
            if (file && entitledNow !== file.entitled) {
              await writeAccountFile(mine, entitledNow)
            }
            logger.log('[Account] refreshed entitlement from remote flag', {
              reason,
              entitledNow,
            })
            return
          }
          case 'none':
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
    [isRevenueCatAnonymous, setAccountId, setCustomer]
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
  }, [reconcile, ready, customerKnown, entitled])

  useEffect(() => {
    const retry = (reason: string) =>
      void isRevenueCatAnonymous().then(
        (anonymous) => {
          if (anonymous) void reconcile(reason)
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
