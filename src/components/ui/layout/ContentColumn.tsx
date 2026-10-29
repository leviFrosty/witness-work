import { PropsWithChildren } from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import DisplayRegionsView from '../../../../modules/display-regions'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { FoldHandled, useLocalFoldPane } from '@/components/ui/layout/FoldPane'
import { isRtlLayout } from '@/lib/direction'

/**
 * A scroll view's content, capped at the form width and centered. It goes
 * inside the scroll view rather than on `contentContainerStyle`: in a
 * right-to-left layout iOS pins a content container narrower than its scroll
 * view to the right edge. While iPhone Duo is partly folded like a book, it
 * keeps to the leading side of the fold instead, as a sheet would.
 */
const ContentColumn = ({
  style,
  children,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) => {
  const { onRegionsChange, pane } = useLocalFoldPane()
  // The pane is physical; React Native mirrors paddings in RTL.
  const side = pane
    ? isRtlLayout()
      ? { paddingLeft: pane.right, paddingRight: pane.left }
      : { paddingLeft: pane.left, paddingRight: pane.right }
    : null

  return (
    // Absolute children ignore padding, so the regions view spans the row.
    <View style={side}>
      <DisplayRegionsView
        style={StyleSheet.absoluteFill}
        onRegionsChange={onRegionsChange}
      />
      <View
        style={[
          {
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
          },
          style,
        ]}
      >
        <FoldHandled>{children}</FoldHandled>
      </View>
    </View>
  )
}

export default ContentColumn
