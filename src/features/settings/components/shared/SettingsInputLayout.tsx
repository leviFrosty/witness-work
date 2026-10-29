import { PropsWithChildren, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import DisplayRegionsView from '../../../../../modules/display-regions'
import useTheme from '@/contexts/theme'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { FoldHandled, useLocalFoldPane } from '@/components/ui/layout/FoldPane'
import { isRtlLayout } from '@/lib/direction'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'

/**
 * Applies the shared settings row treatment to every Preferences screen. While
 * iPhone Duo is partly folded, the column keeps to the leading side of the
 * fold.
 */
const SettingsInputLayout = ({ children }: PropsWithChildren) => {
  const theme = useTheme()
  const viewportRef = useRef<View>(null)
  const { onRegionsChange, pane } = useLocalFoldPane()
  // The pane is physical; React Native mirrors paddings in RTL.
  const side = pane
    ? isRtlLayout()
      ? { paddingLeft: pane.right, paddingRight: pane.left }
      : { paddingLeft: pane.left, paddingRight: pane.right }
    : null

  return (
    <View
      style={[
        { flex: 1, width: '100%', backgroundColor: theme.colors.background },
        side,
      ]}
    >
      {/* Absolute, so it spans the padding too. */}
      <DisplayRegionsView
        style={StyleSheet.absoluteFill}
        onRegionsChange={onRegionsChange}
      />
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
          <FoldHandled>{children}</FoldHandled>
        </VisibilityViewportContext>
      </View>
    </View>
  )
}

export { inputLayout }
export default SettingsInputLayout
