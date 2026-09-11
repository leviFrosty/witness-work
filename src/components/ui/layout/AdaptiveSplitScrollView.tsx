import { ReactNode } from 'react'
import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'

type Props = {
  leading: ReactNode
  trailing: ReactNode
  header?: ReactNode
  leadingFraction?: number
  paddingTop?: number
  paddingBottom: number
  compactPaddingHorizontal?: number
  gap?: number
}

/** Keep reference content visible while browsing records in a wide window. */
export default function AdaptiveSplitScrollView({
  leading,
  trailing,
  header,
  leadingFraction = 0.44,
  paddingTop = 15,
  paddingBottom,
  compactPaddingHorizontal = 15,
  gap = 24,
}: Props) {
  const { isWide, contentMaxWidth } = useAdaptiveLayout()

  if (!isWide) {
    return (
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={{
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          paddingTop,
          paddingBottom,
          paddingHorizontal: compactPaddingHorizontal,
          gap,
        }}
      >
        {header}
        {leading}
        {trailing}
      </KeyboardAwareScrollView>
    )
  }

  return (
    <View
      style={{
        flex: 1,
        width: '100%',
        maxWidth: contentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: 24,
        paddingTop,
      }}
    >
      {header && <View style={{ paddingBottom: gap }}>{header}</View>}
      <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap }}>
        <KeyboardAwareScrollView
          style={{ flex: leadingFraction, minWidth: 0 }}
          contentContainerStyle={{ paddingBottom }}
          keyboardShouldPersistTaps='handled'
          scrollsToTop={false}
        >
          {leading}
        </KeyboardAwareScrollView>
        <KeyboardAwareScrollView
          style={{ flex: 1 - leadingFraction, minWidth: 0 }}
          contentContainerStyle={{ paddingBottom }}
          keyboardShouldPersistTaps='handled'
        >
          {trailing}
        </KeyboardAwareScrollView>
      </View>
    </View>
  )
}
