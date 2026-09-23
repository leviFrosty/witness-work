import { useEffect, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle, View } from 'react-native'
import {
  MapPin as MapPinIcon,
  UserPlus as UserPlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import MapCard from '@/features/map/components/MapCard'
import i18n from '@/lib/locales'
import { Coordinate } from '@/types/contact'

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
  const titleRef = useRef<View>(null)

  useEffect(() => {
    const handle = findNodeHandle(titleRef.current)
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
  }, [])

  return (
    <MapCard fill={fill} onAccessibilityEscape={onCancel}>
      <View
        ref={titleRef}
        accessible
        accessibilityRole='header'
        accessibilityLabel={i18n.t('map_droppedPin')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
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
        style={{ color: theme.colors.textAlt, fontSize: theme.fontSize('sm') }}
      >
        {i18n.t('pinCoordinates', {
          latitude: coordinate.latitude.toFixed(5),
          longitude: coordinate.longitude.toFixed(5),
        })}
      </Text>
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
          onPress={onCancel}
          style={{
            minHeight: 48,
            paddingVertical: 0,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              textAlign: 'center',
            }}
          >
            {i18n.t('cancel')}
          </Text>
        </Button>
      </View>
    </MapCard>
  )
}
