import { View } from 'react-native'
import PinPickerMap from '@/components/PinPickerMap'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { Coordinate } from '@/types/contact'

const INSET = 12

export default function TerritoryLocationField({
  coordinate,
  fromLink = false,
  onChange,
  onClear,
  hints,
  around,
  otherPins,
  pinId = 'territory-pin',
  fill = false,
}: {
  coordinate: Coordinate | undefined

  fromLink?: boolean
  onChange: (coordinate: Coordinate) => void
  onClear: () => void

  hints?: { empty: string; placed: string }

  around?: Coordinate
  otherPins?: { id: string; coordinate: Coordinate }[]
  pinId?: string

  fill?: boolean
}) {
  const theme = useTheme()
  const status = !coordinate
    ? (hints?.empty ?? i18n.t('territories.locationHint'))
    : fromLink
      ? i18n.t('territories.locationFromLink')
      : (hints?.placed ?? i18n.t('territories.locationSet'))
  return (
    <View style={{ padding: INSET, gap: 12, flex: fill ? 1 : undefined }}>
      <View
        style={{
          ...(fill ? { flex: 1, minHeight: 220 } : { height: 220 }),
          borderRadius: inputLayout.sectionRadius - INSET,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}
      >
        <PinPickerMap
          coordinate={coordinate}
          onChange={onChange}
          around={around}
          otherPins={otherPins}
          pinId={pinId}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 4,
          minHeight: 44,
        }}
      >
        <Text
          testID='territory-location-status'
          style={{ flex: 1, color: theme.colors.textAlt }}
        >
          {status}
        </Text>
        {coordinate && (
          <Button
            onPress={onClear}
            accessibilityLabel={i18n.t('territories.removePin')}
            style={{
              minHeight: 44,
              paddingHorizontal: 8,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.error,
              }}
            >
              {i18n.t('territories.removePin')}
            </Text>
          </Button>
        )}
      </View>
    </View>
  )
}
