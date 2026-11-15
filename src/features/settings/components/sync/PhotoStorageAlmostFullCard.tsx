import { useEffect } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Image as ImageIcon, X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import useCloudSyncPhotoStorage from '@/features/settings/hooks/useCloudSyncPhotoStorage'
import useIsSupporter from '@/hooks/useIsSupporter'
import { analytics } from '@/lib/analytics'
import { formatBytes } from '@/lib/formatBytes'
import i18n from '@/lib/locales'
import { SUPPORTER_PHOTO_STORAGE_BYTES } from '@/lib/syncTransport/server/photoUsage'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import {
  upsellDismissed,
  type PhotoStorageUpsellStatus,
} from '@/features/settings/lib/photoStorageUpsell'

type Props = {
  source: 'settings' | 'sync'
}

export function usePhotoStorageUpsell({ source }: Props) {
  const { isSupporter } = useIsSupporter()
  const storage = useCloudSyncPhotoStorage({ refresh: source === 'sync' })
  const dismissed = usePreferences((s) => s.photoStorageUpsellDismissed)
  const status: PhotoStorageUpsellStatus = storage.full ? 'full' : 'almost_full'
  const known = storage.shown && storage.usage !== null
  const roomAgain = known && !storage.almostFull

  useEffect(() => {
    if (roomAgain && dismissed !== null)
      usePreferences.getState().set({ photoStorageUpsellDismissed: null })
  }, [roomAgain, dismissed])

  const visible =
    storage.almostFull &&
    !isSupporter &&
    storage.usage !== null &&
    (source !== 'settings' || !upsellDismissed(dismissed, status))
  return { ...storage, status, visible }
}

export default function PhotoStorageAlmostFullCard({ source }: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { usage, full, fraction, status, visible } = usePhotoStorageUpsell({
    source,
  })

  useEffect(() => {
    if (visible)
      analytics.capture('photo_storage_upsell_shown', { source, status })
  }, [visible, source, status])

  if (!visible || !usage) return null

  const supporterLimit = formatBytes(SUPPORTER_PHOTO_STORAGE_BYTES)
  const barColor = full ? theme.colors.error : theme.colors.orange
  const title = i18n.t(
    full ? 'photoStorageFull_title' : 'photoStorageAlmostFull_title'
  )
  const used = i18n.t('photoStorage_used', {
    used: formatBytes(usage.bytes),
    limit: formatBytes(usage.limit),
  })

  return (
    <Card testID='photo-storage-almost-full' style={{ gap: 14 }}>
      <XView style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            borderCurve: 'continuous',
            backgroundColor: full
              ? theme.colors.errorTranslucent
              : theme.colors.orangeTranslucent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon icon={ImageIcon} size={20} color={barColor} />
        </View>
        <Text
          accessibilityRole='header'
          style={{
            flex: 1,
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {title}
        </Text>
        {source === 'settings' && (
          <IconButton
            testID='photo-storage-almost-full-dismiss'
            icon={XIcon}
            size={18}
            color={theme.colors.textAlt}
            accessibilityLabel={i18n.t('dismiss')}
            onPress={() => {
              usePreferences
                .getState()
                .set({ photoStorageUpsellDismissed: status })
              analytics.capture('photo_storage_upsell_dismissed', { status })
            }}
          />
        )}
      </XView>

      <View
        accessible
        accessibilityRole='progressbar'
        accessibilityLabel={used}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(fraction * 100),
        }}
        style={{ gap: 6 }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
          }}
        >
          {used}
        </Text>
        <View
          style={{
            height: 10,
            borderRadius: 5,
            overflow: 'hidden',
            backgroundColor: theme.colors.border,
          }}
        >
          <View
            testID='photo-storage-almost-full-bar'
            style={{
              width: `${Math.max(2, fraction * 100)}%`,
              height: '100%',
              borderRadius: 5,
              backgroundColor: barColor,
            }}
          />
        </View>
      </View>

      <Text
        style={{
          fontSize: theme.fontSize('md'),
          color: theme.colors.text,
          lineHeight: theme.fontSize('md') * 1.35,
        }}
      >
        {i18n.t(
          full ? 'photoStorageFull_body' : 'photoStorageAlmostFull_body',
          { supporterLimit }
        )}
      </Text>

      <Button
        testID='photo-storage-almost-full-upgrade'
        accessibilityRole='button'
        onPress={() =>
          navigation.navigate('Paywall', {
            source: `photo_storage_${source}`,
            feature: 'photo_storage',
          })
        }
        style={{
          minHeight: 44,
          borderRadius: 999,
          paddingVertical: 11,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.supporterTranslucent,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.supporterText,
          }}
        >
          {i18n.t('photoStorageAlmostFull_upgrade', { supporterLimit })}
        </Text>
      </Button>
    </Card>
  )
}
