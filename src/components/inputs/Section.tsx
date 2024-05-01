import { PropsWithChildren } from 'react'
import { View } from 'react-native'
import useTheme from '../../contexts/theme'
import { rowPaddingVertical } from '../../constants/Inputs'

interface Props {}

const Section: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        borderColor: theme.colors.border,
        borderTopWidth: 2,
        borderBottomWidth: 2,
        backgroundColor: theme.colors.backgroundLighter,
        paddingVertical: rowPaddingVertical,
        paddingLeft: 25,
        gap: 10,
        paddingRight: 3,
      }}
    >
      {children}
    </View>
  )
}

export default Section
