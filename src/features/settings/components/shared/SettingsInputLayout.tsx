import { PropsWithChildren, useRef } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'

/** Applies the shared settings row treatment to every Preferences screen. */
const SettingsInputLayout = ({ children }: PropsWithChildren) => {
  const theme = useTheme()
  const viewportRef = useRef<View>(null)

  return (
    <View
      style={{
        flex: 1,
        width: '100%',
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        ref={viewportRef}
        collapsable={false}
        style={{
          flex: 1,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: inputLayout.horizontalPadding,
        }}
      >
        <VisibilityViewportContext value={viewportRef}>
          {children}
        </VisibilityViewportContext>
      </View>
    </View>
  )
}

export { inputLayout }
export default SettingsInputLayout
