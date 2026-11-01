import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'

export type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'

export default function PullDownMenu({
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
  children,
  triggerSize = 20,
  triggerColor,
  style,
  testID,
}: PullDownMenuProps) {
  const theme = useTheme()
  return (
    <View
      style={style}
      testID={testID}
      accessible
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityValue={
        accessibilityValue === undefined
          ? undefined
          : { text: accessibilityValue }
      }
    >
      {children ?? (
        <LucideIcon
          icon={EllipsisIcon}
          color={triggerColor ?? theme.colors.textAlt}
          size={triggerSize}
        />
      )}
    </View>
  )
}
