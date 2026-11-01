import { View } from 'react-native'
import { Marker } from 'react-native-maps'
import { Flag as FlagIcon, Play as PlayIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import type { Coordinate } from '@/types/contact'
import MapMarkerCard from '@/components/map/MapMarkerCard'
import useMarkerRedraw from '@/hooks/useMarkerRedraw'

export const MARKER_PIN = 26

export function RouteMapPin({
  id,
  coordinate,
  position,
  end,
  selected,
  zIndex,
  accessibilityLabel,
  onPress,
}: {
  id: string
  coordinate: Coordinate

  position?: number

  end?: 'start' | 'finish'
  selected: boolean
  zIndex: number
  accessibilityLabel: string
  onPress: () => void
}) {
  const theme = useTheme()
  const marker = useMarkerRedraw(
    [position, end, selected, theme.colors.accent].join('|')
  )
  const isEnd = position == null

  return (
    <Marker
      identifier={id}
      coordinate={coordinate}
      onPress={onPress}
      ref={marker.ref}
      tracksViewChanges={marker.tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 900 : zIndex}
      accessibilityLabel={accessibilityLabel}
      stopPropagation
    >
      <View
        style={{
          width: MARKER_PIN,
          height: MARKER_PIN,
          borderRadius: MARKER_PIN / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isEnd ? '#fff' : theme.colors.accent,
          borderWidth: 2,
          borderColor: isEnd ? theme.colors.accent : '#fff',
        }}
      >
        {isEnd ? (
          <LucideIcon
            icon={end === 'finish' ? FlagIcon : PlayIcon}
            size={12}
            color={theme.colors.accent}
          />
        ) : (
          <Text
            maxFontSizeMultiplier={1}
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.bold,
              color: '#fff',
            }}
          >
            {position}
          </Text>
        )}
      </View>
    </Marker>
  )
}

export function RouteMapCard({
  id,
  coordinate,
  placement,
  time,
  title,
  selected,
  late,
  zIndex,
  onPress,
}: {
  id: string
  coordinate: Coordinate
  placement: 'above' | 'below'
  time: string
  title: string
  selected: boolean

  late?: boolean
  zIndex: number
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <MapMarkerCard
      id={id}
      coordinate={coordinate}
      placement={placement}
      eyebrow={time}
      eyebrowColor={late ? theme.colors.warnText : undefined}
      title={title}
      selected={selected}
      pin={MARKER_PIN}
      zIndex={zIndex}
      onPress={onPress}
    />
  )
}
