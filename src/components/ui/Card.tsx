import { PropsWithChildren } from 'react'
import { View, ViewProps } from 'react-native'
import useTheme from '@/contexts/theme'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

interface Props extends ViewProps {
  flexDirection?:
    | 'row'
    | 'column'
    | 'row-reverse'
    | 'column-reverse'
    | undefined
}

export const useCardStyle = () => {
  const theme = useTheme()
  return {
    borderRadius: inputLayout.sectionRadius,
    borderCurve: 'continuous' as const,
    backgroundColor: theme.colors.card,
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
            borderRadius: inputLayout.sectionRadius,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.card,
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
