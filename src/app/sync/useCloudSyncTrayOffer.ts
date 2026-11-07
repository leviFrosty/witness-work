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

  thanks: {
    tone: 'supporter',
    title: 'cloudSyncTrayOffer_thanksTitle',
    description: 'cloudSyncTrayOffer_thanksDescription',
    action: 'cloudSyncTrayOffer_thanksAction',
  },
}

export function useCloudSyncTrayOffer(): NotificationItem | null {
  const { isSupporter } = useIsSupporter()
  const { customer, unavailable } = useCustomer()

  const serverAnswered = useServerSupporter(
    (state) =>
      state.account === null ||
      (state.account !== undefined && state.entry?.account === state.account)
  )

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

  const offered = usePreferences(() => cloudSyncOffered())
  const option = usePreferences(() => currentSyncOption())
  const [turningOn, setTurningOn] = useState(false)

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
