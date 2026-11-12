import { View } from 'react-native'
import { Marker } from 'react-native-maps'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useMarkerRedraw from '@/hooks/useMarkerRedraw'
import i18n from '@/lib/locales'
import {
  OUTCOME_ICON,
  OUTCOME_LABEL,
  outcomeColor,
} from '@/features/territories/lib/outcomes'
import {
  drawsAsDot,
  MARKER_SIZE,
  type TerritoryMarker,
} from '@/features/territories/lib/territoryMap'

const SELECTED = 40
const DIMMED = 22
const DOT = 12

export default function TerritoryMapMarker({
  marker,
  selected,
  dimmed,
  dot,
  onPress,
}: {
  marker: TerritoryMarker
  selected: boolean
  dimmed: boolean
  dot: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const outcome = marker.kind === 'door' ? marker.outcome : 'doNotCall'
  const color = outcomeColor(outcome, theme.colors)
  const plain = drawsAsDot(marker, dot) && !selected
  const size = selected ? SELECTED : plain ? DOT : dimmed ? DIMMED : MARKER_SIZE
  const redraw = useMarkerRedraw(
    [size, color, theme.colors.card, theme.colors.textInverse].join('|')
  )
  return (
    <Marker
      ref={redraw.ref}
      identifier={`territory-marker-${marker.id}`}
      testID={`territory-marker-${marker.id}`}
      coordinate={marker.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={redraw.tracksViewChanges}
      zIndex={
        selected ? 30 : dimmed ? 1 : marker.kind === 'doNotCall' ? 20 : 10
      }
      accessibilityLabel={`${marker.address}, ${i18n.t(OUTCOME_LABEL[outcome])}`}
      onPress={(event) => {
        event?.stopPropagation?.()
        onPress()
      }}
    >
      <View
        style={{
          width: SELECTED,
          height: SELECTED,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color,
            borderWidth: selected ? 3 : plain ? 1.5 : 2,
            borderColor: theme.colors.card,
            opacity: dimmed ? 0.55 : 1,
          }}
        >
          {!plain && (
            <LucideIcon
              icon={OUTCOME_ICON[outcome]}
              size={Math.round(size * 0.5)}
              color={theme.colors.textInverse}
            />
          )}
        </View>
      </View>
    </Marker>
  )
}
