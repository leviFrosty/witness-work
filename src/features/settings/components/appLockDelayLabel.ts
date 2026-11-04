import i18n from '@/lib/locales'
import type { AppLockDelay } from '@/stores/appLock'

/** App Lock's Require choices, as Settings lists them. */
export const appLockDelayLabel = (delay: AppLockDelay) => {
  switch (delay) {
    case 0:
      return i18n.t('appLock_immediately')
    case 60:
      return i18n.t('appLock_afterOneMinute')
    case 300:
      return i18n.t('appLock_afterFiveMinutes')
    case 900:
      return i18n.t('appLock_afterFifteenMinutes')
  }
}
