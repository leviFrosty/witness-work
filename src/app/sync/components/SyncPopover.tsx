import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faCloud,
  faCloudArrowUp,
  faRotate,
  faGear,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { useNavigation } from '@react-navigation/native'
import { formatRelative } from '@/lib/dates'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import { iCloudSync } from '@/app/sync/iCloudSync'
import * as ICloudBridge from '../../../../modules/icloud-bridge'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import { RootStackNavigation } from '@/types/rootStack'

const CONTENT_WIDTH = 260

const statusLabel = (
  enabled: boolean,
  lastiCloudSyncAt: number | null,
  available: boolean
): string => {
  if (!enabled) return i18n.t('iCloudStatusDisabled')
  if (!available) return i18n.t('iCloudStatusUnavailable')
  if (!lastiCloudSyncAt) return i18n.t('iCloudStatusWaitingForFirstSync')
  return i18n.t('iCloudStatusLastSynced', {
    relative: formatRelative(lastiCloudSyncAt),
  })
}

/**
 * Supporter-only header affordance: a cloud icon that opens an inline popover
 * with the current iCloud sync status and the two most useful actions (sync
 * now, jump to settings). Replaces the donate-heart for supporters.
 */
const SyncPopover = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { iCloudSyncEnabled, lastiCloudSyncAt } = usePreferences()
  const [available, setAvailable] = useState(() => ICloudBridge.isAvailable())
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setAvailable(ICloudBridge.isAvailable())
    const sub = ICloudBridge.addAvailabilityChangeListener((e) =>
      setAvailable(e.available)
    )
    return () => sub.remove()
  }, [])

  const triggerIcon = !available
    ? faTriangleExclamation
    : syncing
      ? faCloudArrowUp
      : faCloud
  const triggerColor = !iCloudSyncEnabled
    ? theme.colors.textAlt
    : !available
      ? theme.colors.error
      : theme.colors.text

  return (
    <AnchoredPopover
      contentWidth={CONTENT_WIDTH}
      contentStyle={{ padding: 14, gap: 12 }}
      // Right-align under the anchor since the trigger lives in the top-right
      // of the header.
      resolvePosition={({ anchor, windowWidth, contentWidth }) => {
        const margin = 12
        const preferredLeft = anchor.x + anchor.width - contentWidth
        const left = Math.min(
          Math.max(margin, preferredLeft),
          windowWidth - contentWidth - margin
        )
        return { top: anchor.y + anchor.height + 8, left }
      }}
      renderTrigger={({ onPress, anchorRef }) => (
        <View ref={anchorRef} collapsable={false}>
          <Button onPress={onPress}>
            <FontAwesomeIcon
              icon={triggerIcon}
              size={theme.fontSize('lg')}
              style={{ color: triggerColor }}
            />
          </Button>
        </View>
      )}
    >
      {({ close }) => {
        const handleOpenSettings = () => {
          close()
          navigation.navigate('PreferencesiCloud')
        }

        const handleSyncNow = async () => {
          if (syncing) return
          if (!iCloudSyncEnabled) {
            Alert.alert(
              i18n.t('iCloudSyncDisabled_title'),
              i18n.t('iCloudSyncDisabled_description'),
              [
                { style: 'cancel', text: i18n.t('cancel') },
                {
                  text: i18n.t('iCloudSyncDisabled_action'),
                  onPress: handleOpenSettings,
                },
              ]
            )
            return
          }
          setSyncing(true)
          try {
            await iCloudSync.pullAndMerge('popover-manual')
            await iCloudSync.push('popover-manual')
          } finally {
            setSyncing(false)
          }
        }

        return (
          <>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <FontAwesomeIcon
                icon={faCloud}
                size={theme.fontSize('md')}
                style={{ color: theme.colors.text }}
              />
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  fontSize: theme.fontSize('md'),
                }}
              >
                {i18n.t('iCloudSync')}
              </Text>
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {statusLabel(iCloudSyncEnabled, lastiCloudSyncAt, available)}
            </Text>
            <View style={{ gap: 8 }}>
              <Button
                noTransform
                disabled={!available || syncing}
                onPress={handleSyncNow}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  borderRadius: theme.numbers.borderRadiusSm,
                  backgroundColor: theme.colors.backgroundLighter,
                  opacity: !available || syncing ? 0.5 : 1,
                }}
              >
                {syncing ? (
                  <ActivityIndicator color={theme.colors.accent} />
                ) : (
                  <FontAwesomeIcon
                    icon={faRotate}
                    size={theme.fontSize('sm')}
                    style={{ color: theme.colors.accent }}
                  />
                )}
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {syncing ? i18n.t('iCloudSyncing') : i18n.t('iCloudSyncNow')}
                </Text>
              </Button>
              <Button
                noTransform
                onPress={handleOpenSettings}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  borderRadius: theme.numbers.borderRadiusSm,
                  backgroundColor: theme.colors.backgroundLighter,
                }}
              >
                <FontAwesomeIcon
                  icon={faGear}
                  size={theme.fontSize('sm')}
                  style={{ color: theme.colors.text }}
                />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('iCloudSyncSettings')}
                </Text>
              </Button>
            </View>
          </>
        )
      }}
    </AnchoredPopover>
  )
}

export default SyncPopover
