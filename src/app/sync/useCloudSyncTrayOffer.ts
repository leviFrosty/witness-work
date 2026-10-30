import { useEffect, useState } from 'react'
import { Cloud as CloudIcon } from 'lucide-react-native'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import i18n from '@/lib/locales'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import { cloudSyncOffered } from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'
import { useServerSupporter } from '@/stores/serverSupporter'
import { currentSyncOption } from '@/app/sync/syncOption'
import {
  cloudSyncTrayOfferVariant,
  type CloudSyncTrayOfferVariant,
  dismissCloudSyncTrayOffer,
  recordCloudSyncTrayOfferShown,
  retireCloudSyncTrayOffer,
  turnOnCloudSyncFromTray,
} from '@/app/sync/cloudSyncTrayOffer'
import type { TranslationKey } from '@/lib/locales'
import type { NotificationItem, NotificationTone } from '@/types/notifications'

/** Each offer's copy (ADR 0040 §4, its sentences kept intact). */
const OFFERS: Record<
  CloudSyncTrayOfferVariant,
  {
    tone: NotificationTone
    title: TranslationKey
    description: TranslationKey
    action: TranslationKey
  }
> = {
  free: {
    tone: 'accent',
    title: 'cloudSyncTrayOffer_freeTitle',
    description: 'cloudSyncTrayOffer_freeDescription',
    action: 'cloudSyncTrayOffer_freeAction',
  },
  // A thank-you, never a price: it doesn't say "free".
  thanks: {
    tone: 'supporter',
    title: 'cloudSyncTrayOffer_thanksTitle',
    description: 'cloudSyncTrayOffer_thanksDescription',
    action: 'cloudSyncTrayOffer_thanksAction',
  },
}

/**
 * Offers Cloud Sync once, in the tray, to an install from before sync was free
 * that isn't on it (ADR 0040 §4). Turn On switches in place; the row stays
 * until the switch works or the User dismisses it.
 */
export function useCloudSyncTrayOffer(): NotificationItem | null {
  const { isSupporter } = useIsSupporter()
  const { customer, unavailable } = useCustomer()
  // ww-api has answered for this session's account, or there's no account to
  // ask about (ADR 0040 §7).
  const serverAnswered = useServerSupporter(
    (state) =>
      state.account === null ||
      (state.account !== undefined && state.entry?.account === state.account)
  )
  // Until RevenueCat and ww-api answer, a Supporter would read as one who
  // isn't, and see (and be counted for) the wrong offer.
  const supporterKnown =
    isSupporter || ((customer !== null || unavailable) && serverAnswered)
  const installedBeforeFreeSync = usePreferences(
    (state) => state.installedBeforeFreeSync
  )
  const onboardingComplete = usePreferences((state) => state.onboardingComplete)
  const trayOffer = usePreferences((state) => state.cloudSyncTrayOffer)
  const entitlement = usePreferences(
    (state) => state.cloudSyncConfig?.entitlement
  )
  // Both read the store themselves; selecting them re-renders on its changes.
  const offered = usePreferences(() => cloudSyncOffered())
  const option = usePreferences(() => currentSyncOption())
  const [turningOn, setTurningOn] = useState(false)

  // On Cloud Sync another way (Settings, its one-time offer): never offer it
  // again, even if the device leaves it later.
  const onCloud = option === 'cloud'
  useEffect(() => {
    if (onCloud && installedBeforeFreeSync) retireCloudSyncTrayOffer()
  }, [onCloud, installedBeforeFreeSync])

  const variant = cloudSyncTrayOfferVariant({
    hasSyncTransport: hasSyncTransport(),
    cloudSyncOffered: offered,
    entitlement,
    installedBeforeFreeSync,
    onboardingComplete,
    cloudSyncTrayOffer: trayOffer,
    option,
    isSupporter,
  })
  if (!variant || !supporterKnown) return null

  const offer = OFFERS[variant]
  return {
    id: 'cloud_sync_offer',
    kind: 'cloud_sync',
    icon: CloudIcon,
    tone: offer.tone,
    title: i18n.t(offer.title),
    description: i18n.t(offer.description),
    actions: [
      {
        id: 'turn_on',
        label: i18n.t(
          turningOn ? 'cloudSyncTrayOffer_turningOn' : offer.action
        ),
        // Stays in the tray: the row goes once the switch has worked.
        inPlace: true,
        onPress: () => {
          if (turningOn) return
          setTurningOn(true)
          void turnOnCloudSyncFromTray(isSupporter).finally(() =>
            setTurningOn(false)
          )
        },
      },
    ],
    onView: () => recordCloudSyncTrayOfferShown(isSupporter),
    onDismiss: () => dismissCloudSyncTrayOffer(isSupporter),
  }
}
