import { useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import Wrapper from '@/components/ui/layout/Wrapper'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import LoadStatus from '@/features/settings/components/account/activity/LoadStatus'
import {
  type LoadFailure,
  loadFailure,
} from '@/features/settings/components/account/activity/loadState'
import PasskeyListSection from '@/features/settings/components/account/passkeys/PasskeyListSection'
import {
  addPasskeyWithToasts,
  letUnlockWithToasts,
  removeWithConfirm,
} from '@/features/settings/components/account/passkeys/passkeyActions'
import {
  type LoadedPasskeys,
  loadPasskeys,
  phonePasskeySupport,
} from '@/app/account/passkeys'
import { addForegroundListener } from '@/lib/appLifecycle'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { PasskeySupport } from '@/lib/passkeys'
import type { Passkey } from '@/lib/serverAccount/passkeyClient'

/**
 * Settings → Account → Passkeys on phones (ADR 0038 §9): the account's passkeys
 * with "Can unlock your account" or "Sign-in only", Add a Passkey, Let It
 * Unlock, and Remove. Lists again on focus, on returning to the app, after each
 * action, and on pull to refresh.
 */
const AccountPasskeysScreen = () => {
  const theme = useTheme()
  const [loaded, setLoaded] = useState<LoadedPasskeys | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reloads, setReloads] = useState(0)
  const [support, setSupport] = useState<PasskeySupport | null>(null)
  // An action is running: rows and Add wait for it.
  const [busy, setBusy] = useState(false)
  const focused = useIsFocused()
  const latest = useRef(0)

  useEffect(() => {
    void phonePasskeySupport().then(setSupport)
  }, [])

  useEffect(() => {
    if (!focused) return
    const run = ++latest.current
    setLoading(true)
    loadPasskeys()
      .then((next) => {
        if (run !== latest.current) return
        setLoaded(next)
        setFailure(null)
      })
      .catch((error: unknown) => {
        if (run !== latest.current) return
        logger.warn('[passkeys] listing failed', error)
        setFailure(loadFailure(error))
      })
      .finally(() => {
        if (run !== latest.current) return
        setLoading(false)
        setRefreshing(false)
      })
  }, [focused, reloads])

  // Passkeys are added and removed on other devices too.
  useEffect(() => {
    if (!focused) return
    const foreground = addForegroundListener(() =>
      setReloads((count) => count + 1)
    )
    return () => foreground.remove()
  }, [focused])

  const refresh = () => setReloads((count) => count + 1)

  const act = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const passkeys = loaded?.passkeys ?? []
  const showList = loaded != null && failure == null

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                refresh()
              }}
              tintColor={theme.colors.accent}
            />
          }
        >
          {showList ? (
            <PasskeyListSection
              loaded={loaded}
              canAdd={support?.passkeys === true}
              busy={busy}
              onAdd={() =>
                void act(() =>
                  addPasskeyWithToasts({
                    count: passkeys.length,
                    support,
                    source: 'settings',
                  })
                )
              }
              onLetUnlock={(passkey: Passkey) =>
                void act(() => letUnlockWithToasts(passkey))
              }
              onRemove={(passkey: Passkey) =>
                void act(() => removeWithConfirm(passkey, passkeys))
              }
            />
          ) : (
            <LoadStatus
              loading={loading && loaded == null}
              message={
                failure === 'offline'
                  ? i18n.t('passkeys_offline')
                  : failure
                    ? i18n.t('passkeys_loadFailed')
                    : null
              }
              onRetry={refresh}
            />
          )}
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountPasskeysScreen
