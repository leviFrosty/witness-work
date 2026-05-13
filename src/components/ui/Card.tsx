import { PropsWithChildren } from 'react'
import { View, ViewProps } from 'react-native'
import useTheme from '@/contexts/theme'

interface Props extends ViewProps {
  flexDirection?:
    | 'row'
    | 'column'
    | 'row-reverse'
    | 'column-reverse'
    | undefined
}

/**
 * Shared card shape/border styles — use this to keep non-Card pressables
 * consistent.
 */
export const useCardStyle = () => {
  const theme = useTheme()
  return {
    borderRadius: theme.numbers.borderRadiusLg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowOffset: { width: 0, height: 1 } as const,
    shadowColor: theme.colors.shadow,
    shadowOpacity: theme.numbers.shadowOpacity,
  }
}

const Card: React.FC<PropsWithChildren<Props>> = ({
  children,
  flexDirection,
  style,
  ...props
}) => {
  const theme = useTheme()

  return (
    <View
      style={[
        [
          {
            borderRadius: theme.numbers.borderRadiusLg,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: 20,
            paddingHorizontal: 20,
            gap: 15,
            shadowOffset: { width: 0, height: 1 },
            shadowColor: theme.colors.shadow,
            shadowOpacity: theme.numbers.shadowOpacity,
            flexDirection: flexDirection || 'column',
          },
        ],
        [style],
      ]}
      {...props}
    >
      {children}
    </View>
  )
}

export default Card
