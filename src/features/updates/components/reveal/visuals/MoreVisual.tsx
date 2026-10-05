import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { withAlpha } from '@/lib/color'
import { RevealMoreTile } from '@/features/updates/hooks/useRevealPages'
import {
  IconTile,
  RevealVisualProps,
  VISUAL,
  VisualText,
  backOut,
  seg,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const COLUMNS = 3
const GAP = 8

interface Props extends RevealVisualProps {
  tiles: RevealMoreTile[]
}

/**
 * Everything else, as a grid of small tiles that pop in one after another and
 * then ripple, a wave running through them.
 */
const MoreVisual = ({ palette, active, reduceMotion, tiles }: Props) => {
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 300 + tiles.length * 90,
    loopMs: 4200,
    restAt: 0,
  })
  const rows = Math.ceil(tiles.length / COLUMNS)
  const width = (VISUAL.width - GAP * (COLUMNS - 1)) / COLUMNS
  const height = Math.min(86, (VISUAL.height - GAP * (rows - 1)) / rows)

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'center',
        justifyContent: 'center',
        gap: GAP,
      }}
    >
      {tiles.map((tile, index) => (
        <Tile
          key={tile.id}
          tile={tile}
          index={index}
          count={tiles.length}
          width={width}
          height={height}
          intro={intro}
          loop={loop}
          palette={palette}
        />
      ))}
    </View>
  )
}

const Tile = ({
  tile,
  index,
  count,
  width,
  height,
  intro,
  loop,
  palette,
}: {
  tile: RevealMoreTile
  index: number
  count: number
  width: number
  height: number
  intro: DerivedValue<number>
  loop: DerivedValue<number>
  palette: RevealVisualProps['palette']
}) => {
  const slot = 1 / (count + 2)
  const style = useAnimatedStyle(() => {
    const p = seg(intro.value, index * slot, index * slot + slot * 3)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.5 + 0.5 * backOut(p) }],
    }
  })
  // The wave: each tile's icon lifts in turn.
  const iconStyle = useAnimatedStyle(() => {
    const start = 0.05 + (index / count) * 0.5
    const bump = seg(loop.value, start, start + 0.08)
    const settle = seg(loop.value, start + 0.08, start + 0.2)
    const lift = bump * (1 - settle)
    return {
      transform: [{ translateY: -lift * 6 }, { scale: 1 + lift * 0.15 }],
    }
  })
  const compact = height < 76
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 16,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: palette.surfaceBorder,
          backgroundColor: palette.surface,
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? 4 : 8,
          paddingHorizontal: 6,
          shadowColor: tile.color,
          shadowOpacity: palette.surfaceShadowOpacity.rest,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 16,
          backgroundColor: withAlpha(tile.color, 0x14),
        }}
      />
      <Animated.View style={iconStyle}>
        <IconTile
          icon={tile.icon}
          color={tile.color}
          size={compact ? 28 : 34}
        />
      </Animated.View>
      <VisualText
        numberOfLines={2}
        style={{
          fontSize: 11,
          lineHeight: 13,
          textAlign: 'center',
          color: palette.text,
        }}
      >
        {tile.label}
      </VisualText>
    </Animated.View>
  )
}

export default MoreVisual
