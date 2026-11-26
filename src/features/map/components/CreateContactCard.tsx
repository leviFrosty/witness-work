import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native'
import {
  MapPin as MapPinIcon,
  Route as RouteIcon,
  UserPlus as UserPlusIcon,
  X as XIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { findNodeHandle } from '@/lib/findNodeHandle'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Switch from '@/components/ui/Switch'
import useTheme from '@/contexts/theme'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import MapCard from '@/features/map/components/MapCard'
import useCopyText from '@/features/map/hooks/useCopyText'
import type { PinAddressLookup } from '@/features/map/hooks/useMapContactCreation'
import { formatCoordinate, mapLinks } from '@/lib/mapLinks'
import { navigateTo } from '@/lib/address'
import { formatPinAddressParts } from '@/lib/reverseGeocode'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'
import { usePreferences } from '@/stores/preferences'
import { Contact, Coordinate } from '@/types/contact'
import { ltrIsolate } from '@/lib/direction'

export default function CreateContactCard({
  coordinate,
  addressLookup,
  onCreate,
  onCancel,
  fill = false,
}: {
  coordinate: Coordinate
  addressLookup?: PinAddressLookup
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
    const handle = findNodeHandle(focusRef.current)
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
    AccessibilityInfo.announceForAccessibility(i18n.t('map_droppedPin'))
  }, [])

  const links = mapLinks(formatCoordinate(coordinate))
  const resolved = addressLookup?.enabled ? addressLookup.result : null
  const addressParts = resolved ? formatPinAddressParts(resolved.address) : null
  const coordinatesText = ltrIsolate(
    i18n.t('pinCoordinates', {
      latitude: coordinate.latitude.toFixed(5),
      longitude: coordinate.longitude.toFixed(5),
    })
  )

  const title = addressParts?.primary || i18n.t('map_droppedPin')
  const subtitle = addressParts
    ? addressParts.secondary || coordinatesText
    : addressLookup?.enabled && addressLookup.status === 'loading'
      ? `${coordinatesText} · ${i18n.t('map_lookingUpAddress')}`
      : addressLookup?.enabled && addressLookup.status === 'empty'
        ? `${coordinatesText} · ${i18n.t('map_noAddressFound')}`
        : coordinatesText

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
      ...(resolved
        ? [
            {
              id: 'copy_address',
              title: i18n.t('copyAddress'),
              systemImage: 'doc.on.doc' as const,
              onPress: () => void copyText(resolved.formattedAddress),
            },
          ]
        : []),
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
        onPress: () =>
          void shareUrl(Platform.OS === 'ios' ? links.apple : links.google),
      },
    ],
    ...(addressLookup?.canToggle
      ? [
          [
            {
              id: 'toggle_address_lookup',
              title: i18n.t(
                addressLookup.enabled
                  ? 'map_turnOffAddressLookup'
                  : 'map_turnOnAddressLookup'
              ),
              systemImage: addressLookup.enabled
                ? ('mappin.slash' as const)
                : ('mappin.and.ellipse' as const),
              onPress: () => addressLookup.setEnabled(!addressLookup.enabled),
            },
          ],
        ]
      : []),
  ]

  return (
    <MapCard fill={fill} onAccessibilityEscape={onCancel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View ref={focusRef} style={{ flex: 1, minWidth: 0 }}>
          <ContextMenu actions={actions}>
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
                  {title}
                </Text>
              </View>
              <Text
                numberOfLines={2}
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {subtitle}
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
        <Button
          noTransform
          hitSlop={0}
          accessibilityRole='button'
          variant='outline'
          onPress={navigate}
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
      {addressLookup?.canToggle && (
        <View
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 44,
            gap: 12,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('map_autoLookupPinAddress')}
          </Text>
          <Switch
            testID='map-pin-auto-lookup-switch'
            accessibilityLabel={i18n.t('map_autoLookupPinAddress')}
            value={addressLookup.enabled}
            onValueChange={addressLookup.setEnabled}
          />
        </View>
      )}
    </MapCard>
  )
}
