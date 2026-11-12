import type { ReactNode } from 'react'
import { Modal, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import Header from '@/components/ui/layout/Header'
import HorizontalSafeArea from '@/components/ui/layout/HorizontalSafeArea'
import Text from '@/components/ui/MyText'
import { webTextTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function TerritoryMapEditor({
  visible,
  onClose,
  children,
}: {
  visible: boolean
  onClose: () => void
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <Modal
      visible={visible}
      animationType='slide'
      presentationStyle='fullScreen'
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <HorizontalSafeArea backgroundColor={theme.colors.background}>
          {children}
        </HorizontalSafeArea>
      </GestureHandlerRootView>
    </Modal>
  )
}

export function TerritoryMapEditorFrame({
  title,
  onClose,
  onDone,
  testID,
  children,
}: {
  title: string
  onClose: () => void
  onDone: () => void
  testID: string
  children: ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const column = useFoldColumn(inputLayout.contentMaxWidth)
  return (
    <View testID={testID} style={{ flex: 1 }}>
      <Header
        buttonType='exit'
        onPressLeftIcon={onClose}
        title={title}
        rightElement={
          <Button
            onPress={onDone}
            testID={`${testID}-done`}
            style={{
              position: 'absolute',
              right: 0,
              ...webTextTargetFrame('end'),
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                textDecorationLine: 'underline',
                fontSize: 16,
              }}
            >
              {i18n.t('done')}
            </Text>
          </Button>
        }
      />
      <View
        style={[
          {
            flex: 1,
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 12,
          },
          column,
        ]}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.card,
            borderRadius: inputLayout.sectionRadius,
            borderCurve: 'continuous',
          }}
        >
          {children}
        </View>
      </View>
    </View>
  )
}
