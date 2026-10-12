import { Info } from 'lucide-react-native'
import { Pressable } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export type InfoPopoverProps = {
  title: string
  description: string
  /** Keep the 44pt target without making a text line 44pt tall. */
  inline?: boolean
  /** Center the icon in its tap target, e.g. at the end of an input row. */
  centered?: boolean
  /** Icon color override, e.g. on a tinted hero. Defaults to `textAlt`. */
  color?: string
}

/**
 * Layout of the view around the trigger: an inline one gives back the height
 * its target adds to a text line. On the native host rather than the trigger,
 * since the host sizes to the trigger's full frame.
 */
export const infoPopoverHostStyle = (inline = false) =>
  ({ marginVertical: inline ? -12 : 0, flexShrink: 0 }) as const

/** The info icon that opens an `InfoPopover`, in its 44pt tap target. */
export default function InfoPopoverTrigger({
  title,
  centered = false,
  color,
  expanded,
  onPress,
}: Omit<InfoPopoverProps, 'description' | 'inline'> & {
  /** Unknown where the platform doesn't report it. */
  expanded?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={i18n.t('infoPopoverLabel', { title })}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: centered ? 'center' : 'flex-start',
        paddingLeft: centered ? 0 : 6,
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <LucideIcon
        icon={Info}
        size={theme.fontSize('md')}
        color={color ?? theme.colors.textAlt}
      />
    </Pressable>
  )
}
