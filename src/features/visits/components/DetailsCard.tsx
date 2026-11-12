import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'

export const DETAILS_CARD_EDGE = 16

export default function DetailsCard({
  children,
  style,
  testID,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.numbers.borderRadiusLg,
          paddingVertical: DETAILS_CARD_EDGE,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
