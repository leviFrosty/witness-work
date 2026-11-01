import { PropsWithChildren } from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import DisplayRegionsView from '../../../../modules/display-regions'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { FoldHandled, useLocalFoldPane } from '@/components/ui/layout/FoldPane'
import { isRtlLayout } from '@/lib/direction'

const ContentColumn = ({
  style,
  children,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) => {
  const { onRegionsChange, pane } = useLocalFoldPane()

  const side = pane
    ? isRtlLayout()
      ? { paddingLeft: pane.right, paddingRight: pane.left }
      : { paddingLeft: pane.left, paddingRight: pane.right }
    : null

  return (
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
