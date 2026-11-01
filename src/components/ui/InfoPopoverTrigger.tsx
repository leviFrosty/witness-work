import { Info } from 'lucide-react-native'
import { Pressable } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export type InfoPopoverProps = {
  title: string
  description: string

  inline?: boolean

  centered?: boolean

  color?: string
}

export const infoPopoverHostStyle = (inline = false) =>
  ({ marginVertical: inline ? -12 : 0, flexShrink: 0 }) as const

export default function InfoPopoverTrigger({
  title,
  centered = false,
  color,
  expanded,
  onPress,
}: Omit<InfoPopoverProps, 'description' | 'inline'> & {
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
