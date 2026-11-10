import { StyleSheet, View } from 'react-native'
import useTheme from '@/contexts/theme'

export const inputLayout = {
  rowMinHeight: 56,
  rowPadding: 12,
  horizontalPadding: 16,
  iconSize: 20,
  labelGap: 12,
  sectionBorderWidth: 0,
  sectionRadius: 26,
  sectionGap: 32,
  controlGap: 10,
  controlRadius: 16,
  controlPadding: 16,
  descriptionGap: 4,
  controlMinHeight: 44,
  controlMaxWidth: 200,
  contentMaxWidth: 680,
}

export const RowSeparator = ({ hasIcon }: { hasIcon?: boolean }) => {
  const theme = useTheme()
  return (
    <View
      pointerEvents='none'
      style={{
        position: 'absolute',
        bottom: 0,
        start:
          inputLayout.horizontalPadding +
          (hasIcon ? inputLayout.iconSize + inputLayout.labelGap : 0),
        end: inputLayout.horizontalPadding,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.border,
      }}
    />
  )
}
