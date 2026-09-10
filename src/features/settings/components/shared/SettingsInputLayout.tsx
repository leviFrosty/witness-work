import { PropsWithChildren } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

/** Applies the shared settings row treatment to every Preferences screen. */
const SettingsInputLayout = ({ children }: PropsWithChildren) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flex: 1,
        width: '100%',
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: inputLayout.horizontalPadding,
        }}
      >
        {children}
      </View>
    </View>
  )
}

export { inputLayout }
export default SettingsInputLayout
