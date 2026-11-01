import { Mic as MicIcon } from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { isDarkTheme } from '@/features/scribe/shaders/orbPalette'
import ScribeOrb from '@/features/scribe/components/ScribeOrb'
import ScribeOfflineBadge from '@/features/scribe/components/ScribeOfflineBadge'

interface Props {
  box: number

  canvas: number
  core: number
  iconSize: number
  offline: boolean

  surface: string
  badgeOffset: number

  pausesOffscreen?: boolean
}

const ScribeMicOrb = ({
  box,
  canvas,
  core,
  iconSize,
  offline,
  surface,
  badgeOffset,
  pausesOffscreen,
}: Props) => {
  const theme = useTheme()
  const glyph = isDarkTheme(theme)
    ? theme.colors.text
    : theme.colors.textInverse
  const inset = (box - canvas) / 2
  return (
    <View style={{ width: box, height: box }}>
      <ScribeOrb
        size={canvas}
        core={core}
        state={offline ? 'disabled' : 'idle'}
        offline={offline}
        pausesOffscreen={pausesOffscreen}
        style={{ position: 'absolute', left: inset, top: inset }}
      />
      <View
        pointerEvents='none'
        style={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: offline ? 0.75 : 1,
        }}
      >
        <LucideIcon
          icon={MicIcon}
          size={iconSize}
          color={glyph}
          strokeWidth={2.4}
        />
      </View>
      {offline && (
        <ScribeOfflineBadge ringColor={surface} offset={badgeOffset} />
      )}
    </View>
  )
}

export default ScribeMicOrb
