import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faCloud,
  faCloudArrowUp,
  faRotate,
  faGear,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import useTheme from '../../contexts/theme'
import { usePreferences } from '../../stores/preferences'
import { iCloudSync } from '../../lib/sync/iCloudSync'
import * as ICloudBridge from '../../../modules/icloud-bridge'
import i18n from '../../lib/locales'
import Text from '../MyText'
import Button from '../Button'
import { RootStackNavigation } from '../../types/rootStack'

type AnchorRect = { x: number; y: number; width: number; height: number }

const statusLabel = (
  enabled: boolean,
  lastiCloudSyncAt: number | null,
  available: boolean
): string => {
  if (!enabled) return i18n.t('iCloudStatusDisabled')
  if (!available) return i18n.t('iCloudStatusUnavailable')
  if (!lastiCloudSyncAt) return i18n.t('iCloudStatusWaitingForFirstSync')
  return i18n.t('iCloudStatusLastSynced', {
    relative: moment(lastiCloudSyncAt).fromNow(),
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
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const dims = useWindowDimensions()
  const progress = useSharedValue(0)

  useEffect(() => {
    setAvailable(ICloudBridge.isAvailable())
    const sub = ICloudBridge.addAvailabilityChangeListener((e) =>
      setAvailable(e.available)
    )
    return () => sub.remove()
  }, [])

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 140 })
  }, [open, progress])

  const handlePress = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setOpen(true)
    })
  }

  const close = () => setOpen(false)

  const handleSyncNow = async () => {
    if (!iCloudSyncEnabled || syncing) return
    setSyncing(true)
    try {
      await iCloudSync.pullAndMerge('popover-manual')
      await iCloudSync.push('popover-manual')
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenSettings = () => {
    close()
    navigation.navigate('PreferencesiCloud')
  }

  const contentWidth = 260

  const popoverStyle = (() => {
    if (!anchor) return { top: 0, left: 0 }
    const margin = 12
    // Right-align the popover to the anchor's right edge since the trigger
    // lives in the top-right of the header.
    const preferredLeft = anchor.x + anchor.width - contentWidth
    const left = Math.min(
      Math.max(margin, preferredLeft),
      dims.width - contentWidth - margin
    )
    const top = anchor.y + anchor.height + 8
    return { top, left }
  })()

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))

  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }))

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
    <>
      <View ref={anchorRef} collapsable={false}>
        <Button onPress={handlePress}>
          <FontAwesomeIcon
            icon={triggerIcon}
            size={theme.fontSize('lg')}
            style={{ color: triggerColor }}
          />
        </Button>
      </View>
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType='none'
        onRequestClose={close}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.2)',
            },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: contentWidth,
              borderRadius: theme.numbers.borderRadiusMd,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              padding: 14,
              gap: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
            },
            popoverStyle,
            contentStyle,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
              disabled={!iCloudSyncEnabled || !available || syncing}
              onPress={handleSyncNow}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 10,
                borderRadius: theme.numbers.borderRadiusSm,
                backgroundColor: theme.colors.backgroundLighter,
                opacity: !iCloudSyncEnabled || !available || syncing ? 0.5 : 1,
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
        </Animated.View>
        <StatusBar translucent />
      </Modal>
    </>
  )
}

export default SyncPopover
