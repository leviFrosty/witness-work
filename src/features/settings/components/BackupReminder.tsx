import {
  ChevronRight as ChevronRightIcon,
  TriangleAlert as TriangleAlertIcon,
  X as XIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import { usePreferences } from '@/stores/preferences'
import XView from '@/components/ui/layout/XView'
import IconButton from '@/components/ui/IconButton'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { useEffect, useRef, useState } from 'react'
import { analytics } from '@/lib/analytics'
import { RootStackNavigation } from '@/types/rootStack'

type Props = {
  /**
   * Slim, deprioritized one-line bar instead of the full warning card. Used
   * when the user already has iCloud sync turned on — their data is being
   * backed up continuously, so the local-export nag should be present but not
   * shouty.
   */
  compact?: boolean
}

const BackupReminder = ({ compact }: Props) => {
  const theme = useTheme()
  const { backupNotificationFrequencyAsDays, set } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()
  const isFocused = useIsFocused()
  const viewed = useRef(false)
  const [headerHeight, setHeaderHeight] = useState<number>()
  const variant = compact ? 'compact' : 'full'

  useEffect(() => {
    if (!isFocused) {
      viewed.current = false
      return
    }
    if (viewed.current) return
    viewed.current = true
    analytics.capture('backup_reminder_viewed', {
      source: 'home',
      variant,
      frequency_days: backupNotificationFrequencyAsDays,
    })
  }, [isFocused, variant, backupNotificationFrequencyAsDays])

  const handleBackup = () => {
    analytics.capture('backup_reminder_clicked', {
      source: 'home',
      variant,
      frequency_days: backupNotificationFrequencyAsDays,
    })
    navigation.navigate('Import and Export', { source: 'backup_reminder' })
  }

  const handleDismiss = () => {
    analytics.capture('backup_reminder_dismissed', {
      source: 'home',
      variant,
      frequency_days: backupNotificationFrequencyAsDays,
    })
    set({ lastBackupDate: new Date() })
  }

  const actions: ContextMenuEntries = [
    [
      {
        id: 'backup_now',
        title: i18n.t('backupNow'),
        systemImage: 'square.and.arrow.up',
        onPress: handleBackup,
      },
      {
        id: 'backup_settings',
        title: i18n.t('backupSettings'),
        systemImage: 'gearshape',
        onPress: () => navigation.navigate('PreferencesBackups'),
      },
    ],
    [
      {
        id: 'dismiss',
        title: i18n.t('dismiss'),
        systemImage: 'xmark',
        onPress: handleDismiss,
      },
    ],
  ]

  // The ✕ sits over the card as a sibling of the long-press target, so the
  // target holds no nested buttons (Android's long press needs that).
  if (compact) {
    const iconSize = theme.fontSize('xs')
    return (
      <View>
        <ContextMenu
          analyticsSurface='backup_reminder'
          onPress={handleBackup}
          accessibilityLabel={i18n.t('recommendedBackup')}
          actions={actions}
        >
          <XView
            style={{
              backgroundColor: theme.colors.warnTranslucent,
              borderColor: theme.colors.warn,
              borderWidth: 1,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: theme.numbers.borderRadiusMd,
              gap: 8,
            }}
          >
            <LucideIcon
              icon={TriangleAlertIcon}
              color={theme.colors.warn}
              size={iconSize}
            />
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.text,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {i18n.t('recommendedBackup')}
            </Text>
            <XView style={{ gap: 4 }}>
              <LucideIcon
                icon={ChevronRightIcon}
                color={theme.colors.textAlt}
                size={iconSize}
              />
              <View style={{ width: iconSize }} />
            </XView>
          </XView>
        </ContextMenu>
        <View
          pointerEvents='box-none'
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 13,
            justifyContent: 'center',
          }}
        >
          <IconButton
            icon={XIcon}
            color={theme.colors.textAlt}
            size='xs'
            accessibilityLabel={i18n.t('dismiss')}
            onPress={handleDismiss}
          />
        </View>
      </View>
    )
  }

  return (
    <View>
      <ContextMenu
        analyticsSurface='backup_reminder'
        onPress={handleBackup}
        actions={actions}
      >
        <View
          style={{
            backgroundColor: theme.colors.errorTranslucent,
            borderColor: theme.colors.error,
            borderWidth: 1,
            padding: 20,
            borderRadius: theme.numbers.borderRadiusLg,
            gap: 10,
          }}
        >
          <XView
            style={{ paddingRight: theme.fontSize() + 10 }}
            onLayout={(event) =>
              setHeaderHeight(event.nativeEvent.layout.height)
            }
          >
            <IconButton icon={TriangleAlertIcon} color={theme.colors.error} />
            <Text
              style={{
                flexShrink: 1,
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.error,
              }}
            >
              {i18n.t('recommendedBackup')}
            </Text>
          </XView>
          <Text>
            {i18n.t('recommendedBackup_description', {
              count: backupNotificationFrequencyAsDays,
            })}
          </Text>
          <Text
            style={{
              textDecorationLine: 'underline',
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('backupNow')}
          </Text>
        </View>
      </ContextMenu>
      <View
        pointerEvents='box-none'
        style={{
          position: 'absolute',
          top: 21,
          right: 21,
          height: headerHeight,
          justifyContent: 'center',
        }}
      >
        <IconButton
          icon={XIcon}
          color={theme.colors.text}
          accessibilityLabel={i18n.t('dismiss')}
          onPress={handleDismiss}
        />
      </View>
    </View>
  )
}

export default BackupReminder
