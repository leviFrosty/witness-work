import { useEffect, useState } from 'react'
import { View } from 'react-native'
import InlineNotice from '@/components/ui/InlineNotice'
import i18n, { _i18n } from '@/lib/locales'
import { logger } from '@/lib/logger'
import { helpLocaleFor } from '@/features/updates/lib/helpCenter/locale'
import { loadSnapshot } from '@/features/updates/lib/helpCenter/snapshot'
import LaunchSplash from '@/app/launch/LaunchSplash'
import SignInPage from '@/app/web-sign-in/components/SignInPage'
import WebSignInRoot from '@/app/web-sign-in/WebSignInRoot'

type UnlockedAppModule = typeof import('@/app/UnlockedApp')

let loaded: UnlockedAppModule | null = null
let loading: Promise<UnlockedAppModule> | null = null

function load(): Promise<UnlockedAppModule> {
  loading ??= Promise.all([
    import('@/app/UnlockedApp'),
    loadSnapshot(helpLocaleFor(_i18n.locale)).catch(() => {}),
  ]).then(
    ([module]) => (loaded = module),
    (error: unknown) => {
      loading = null
      throw error
    }
  )
  return loading
}

export function preloadUnlockedApp(): void {
  load().catch((error: unknown) =>
    logger.warn('[launch] Preloading the app failed', error)
  )
}

const INTERACTIONS = ['pointerdown', 'keydown', 'focusin'] as const

export function preloadUnlockedAppOnInteraction(): () => void {
  if (loaded || typeof window === 'undefined') return () => {}
  const start = () => {
    stop()
    preloadUnlockedApp()
  }
  const stop = () => {
    for (const type of INTERACTIONS)
      window.removeEventListener(type, start, true)
  }
  for (const type of INTERACTIONS)
    window.addEventListener(type, start, { capture: true, passive: true })
  return stop
}

export default function UnlockedApp() {
  const [app, setApp] = useState(loaded)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (app) return
    let active = true
    load().then(
      (module) => {
        if (active) setApp(module)
      },
      (error: unknown) => {
        logger.warn('[launch] Loading the app failed', error)
        if (active) setFailed(true)
      }
    )
    return () => {
      active = false
    }
  }, [app, attempt])

  useEffect(() => {
    if (!failed) return
    const retry = () => {
      setFailed(false)
      setAttempt((count) => count + 1)
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [failed])

  if (app) return <app.default />
  if (!failed) return <LaunchSplash />
  return (
    <WebSignInRoot>
      <SignInPage title={i18n.t('webAppLoadFailed_title')}>
        <View testID='web-app-load-failed'>
          <InlineNotice
            message={i18n.t('webAppLoadFailed_message')}
            onRetry={() => {
              setFailed(false)
              setAttempt((count) => count + 1)
            }}
          />
        </View>
      </SignInPage>
    </WebSignInRoot>
  )
}
