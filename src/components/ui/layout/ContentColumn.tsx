import { PropsWithChildren } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

/**
 * A scroll view's content, capped at the form width and centered. It goes
 * inside the scroll view rather than on `contentContainerStyle`: in a
 * right-to-left layout iOS pins a content container narrower than its scroll
 * view to the right edge.
 */
const ContentColumn = ({
  style,
  children,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) => (
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
    {children}
  </View>
)

export default ContentColumn
