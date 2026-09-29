import { useEffect, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle, Platform, View } from 'react-native'
import {
  MapPin as MapPinIcon,
  Route as RouteIcon,
  UserPlus as UserPlusIcon,
  X as XIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import MapCard from '@/features/map/components/MapCard'
import useCopyText from '@/features/map/hooks/useCopyText'
import { formatCoordinate, mapLinks } from '@/lib/mapLinks'
import { navigateTo } from '@/lib/address'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'
import { usePreferences } from '@/stores/preferences'
import { Contact, Coordinate } from '@/types/contact'

export default function CreateContactCard({
  coordinate,
  onCreate,
  onCancel,
  fill = true,
}: {
  coordinate: Coordinate
  onCreate: () => void
  onCancel: () => void
  fill?: boolean
}) {
  const theme = useTheme()
  const focusRef = useRef<View>(null)
  const copyText = useCopyText()
  const defaultNavigationMapProvider = usePreferences(
    (s) => s.defaultNavigationMapProvider
  )

  useEffect(() => {
    // The card's content is one long-press target, so VoiceOver/TalkBack land
    // on it (with its menu as custom actions) rather than on the title alone.
    const handle = findNodeHandle(focusRef.current)
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
    AccessibilityInfo.announceForAccessibility(i18n.t('map_droppedPin'))
  }, [])

  const links = mapLinks(formatCoordinate(coordinate))
  const pin: Contact = {
    id: '',
    name: '',
    createdAt: new Date(),
    coordinate,
    userDraggedCoordinate: true,
  }

  const navigate = () => navigateTo(pin, defaultNavigationMapProvider)

  const actions: ContextMenuEntries = [
    [
      {
        id: 'create_contact',
        title: i18n.t('createContactHere'),
        systemImage: 'person.crop.circle.badge.plus',
        onPress: onCreate,
      },
    ],
    [
      {
        id: 'navigate',
        title: i18n.t('navigateHere'),
        systemImage: 'arrow.triangle.turn.up.right.diamond',
        onPress: navigate,
      },
      {
        id: 'copy_coordinates',
        title: i18n.t('copyCoordinates'),
        systemImage: 'doc.on.doc',
        onPress: () => void copyText(formatCoordinate(coordinate)),
      },
      {
        id: 'share',
        title: i18n.t('shareLocationEllipsis'),
        systemImage: 'square.and.arrow.up',
        // Each platform's own maps app reads its link best.
        onPress: () =>
          void shareUrl(Platform.OS === 'ios' ? links.apple : links.google),
      },
    ],
  ]

  return (
    <MapCard fill={fill} onAccessibilityEscape={onCancel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View ref={focusRef} style={{ flex: 1 }}>
          <ContextMenu actions={actions} analyticsSurface='map_dropped_pin'>
            <View style={{ gap: 4 }}>
              <View
                accessibilityRole='header'
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: theme.colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LucideIcon
                    icon={MapPinIcon}
                    size={20}
                    color={theme.colors.textInverse}
                  />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('lg'),
                    flexShrink: 1,
                  }}
                >
                  {i18n.t('map_droppedPin')}
                </Text>
              </View>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('pinCoordinates', {
                  latitude: coordinate.latitude.toFixed(5),
                  longitude: coordinate.longitude.toFixed(5),
                })}
              </Text>
            </View>
          </ContextMenu>
        </View>
        <Button
          noTransform
          hitSlop={0}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('cancel')}
          onPress={onCancel}
          style={{
            width: 44,
            height: 44,
            padding: 0,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            alignSelf: 'flex-start',
          }}
        >
          <LucideIcon icon={XIcon} size={20} color={theme.colors.text} />
        </Button>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
        }}
      >
        <Button
          noTransform
          hitSlop={0}
          accessibilityRole='button'
          onPress={onCreate}
          style={{
            paddingHorizontal: 10,
            minHeight: 48,
            flex: 1,
            gap: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        >
          <LucideIcon
            icon={UserPlusIcon}
            size={18}
            color={theme.colors.textInverse}
          />
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
              flexShrink: 1,
              textAlign: 'center',
            }}
          >
            {i18n.t('map_createContact')}
          </Text>
        </Button>
        {/* Secondary to Create: outlined and only as wide as its label. */}
        <Button
          noTransform
          hitSlop={0}
          accessibilityRole='button'
          variant='outline'
          onPress={() => {
            analytics.capture('map_dropped_pin_navigate_pressed')
            navigate()
          }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 0,
            minHeight: 48,
            gap: 6,
            justifyContent: 'center',
            flexShrink: 1,
          }}
        >
          <LucideIcon icon={RouteIcon} size={16} color={theme.colors.text} />
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('xs'),
              flexShrink: 1,
            }}
          >
            {i18n.t('navigateHere')}
          </Text>
        </Button>
      </View>
    </MapCard>
  )
}
