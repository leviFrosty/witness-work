import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'

export type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'

/**
 * A native menu that opens on tap: a SwiftUI `Menu` on iOS
 * (`PullDownMenu.ios.tsx`) and a Material dropdown menu on Android
 * (`PullDownMenu.android.tsx`). Other platforms render the trigger without a
 * menu.
 *
 * Use it for a visible "More" button in headers, for selection menus (give
 * actions `checked`), and for rows whose content can't host a long-press
 * `ContextMenu` (e.g. rows with text inputs). Everything else should put
 * secondary actions in a `ContextMenu`.
 */
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
