import { ReactNode } from 'react'
import { Platform, View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/**
 * A bottom sheet with Cancel and Done, so every picker opens under the thumb.
 * The picker edits a draft that's already on screen, so on a phone dismissing
 * the sheet keeps it like Done does, and Cancel is the only way to back out of
 * a change. On the web, where Escape and a click outside mean "never mind",
 * dismissing cancels.
 */
const PickerSheet = (props: {
  open: boolean
  onCancel: () => void
  onDone: () => void
  doneTestID?: string
  /** Names the sheet for a screen reader (web dialogs). */
  title?: string
  children: ReactNode
}) => {
  const theme = useTheme()
  // The buttons' frames reach past the header's padding so their text stays put.
  const edge = (MIN_TOUCH_TARGET - 20) / 2

  return (
    <Sheet
      open={props.open}
      onOpenChange={(next) => {
        if (next) return
        if (Platform.OS === 'web') props.onCancel()
        else props.onDone()
      }}
      backgroundColor={theme.colors.background}
      accessibilityLabel={props.title}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Button
          noTransform
          onPress={props.onCancel}
          style={{
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            paddingHorizontal: edge,
            marginHorizontal: -edge,
          }}
        >
          <Text style={{ color: theme.colors.accent, fontSize: 16 }}>
            {i18n.t('cancel')}
          </Text>
        </Button>
        <Button
          noTransform
          onPress={props.onDone}
          testID={props.doneTestID}
          style={{
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            alignItems: 'flex-end',
            paddingHorizontal: edge,
            marginHorizontal: -edge,
          }}
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
    </Sheet>
  )
}

export default PickerSheet
