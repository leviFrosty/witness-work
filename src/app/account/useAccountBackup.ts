import { useEffect } from 'react'
import { installAccountBackup } from '@/app/account/backup'
import { offerRestoreOnFreshInstall } from '@/app/account/backupRestore'
import { logger } from '@/lib/logger'
import { usePreferences } from '@/stores/preferences'

export function useAccountBackup(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    return installAccountBackup()
  }, [ready])

  const onboarded = usePreferences((state) => state.onboardingComplete)
  useEffect(() => {
    if (!ready || !onboarded) return
    offerRestoreOnFreshInstall().catch((error: unknown) =>
      logger.warn('[backup] fresh-install restore offer failed', error)
    )
  }, [ready, onboarded])
}
