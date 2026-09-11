import { PropsWithChildren } from 'react'
import { View, ViewProps } from 'react-native'
import useTheme from '@/contexts/theme'
import {
  drawerLayout,
  inputLayout,
  useInputLayout,
} from '@/components/ui/inputs/InputLayout'

type Props = ViewProps

const Section: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  ...props
}) => {
  const theme = useTheme()
  const layout = useInputLayout()

  return (
    <View
      style={[
        {
          borderColor: theme.colors.border,
          borderWidth:
            layout === 'settings' ? inputLayout.sectionBorderWidth : 0,
          borderRadius: theme.numbers.borderRadiusLg,
          backgroundColor:
            layout === 'drawer'
              ? 'transparent'
              : theme.colors.backgroundLighter,
          padding: 0,
          gap: layout === 'drawer' ? drawerLayout.rowGap : 0,
          overflow: 'hidden',
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  )
}

export default Section
