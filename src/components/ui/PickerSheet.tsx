import { ReactNode, useEffect, useState } from 'react'
import { Modal, View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** A bottom sheet with Cancel and Done, so every picker opens under the thumb. */
const PickerSheet = (props: {
  open: boolean
  onCancel: () => void
  onDone: () => void
  doneTestID?: string
  children: ReactNode
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  // Keep the Modal mounted through the sheet's dismiss animation.
  const [mounted, setMounted] = useState(props.open)

  useEffect(() => {
    if (props.open) {
      setMounted(true)
      return
    }
    const timeout = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(timeout)
  }, [props.open])

  return (
    // The RN Modal hosts the sheet in its own window; without it the sheet
    // renders behind a native modal presentation.
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={props.onCancel}
    >
      <Sheet
        open={props.open}
        modal={false}
        snapPointsMode='fit'
        onOpenChange={(next: boolean) => {
          if (!next) props.onDone()
        }}
        transition='quick'
        disableDrag
      >
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame
          backgroundColor={theme.colors.background}
          paddingBottom={insets.bottom}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Button noTransform onPress={props.onCancel} hitSlop={8}>
              <Text style={{ color: theme.colors.accent, fontSize: 16 }}>
                {i18n.t('cancel')}
              </Text>
            </Button>
            <Button
              noTransform
              onPress={props.onDone}
              hitSlop={8}
              testID={props.doneTestID}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: 16,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('done')}
              </Text>
            </Button>
          </View>
          {props.children}
        </Sheet.Frame>
      </Sheet>
    </Modal>
  )
}

export default PickerSheet
