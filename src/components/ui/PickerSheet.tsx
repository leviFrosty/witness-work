import { ReactNode } from 'react'
import { View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/**
 * A bottom sheet with Cancel and Done, so every picker opens under the thumb.
 * The picker edits a draft that's already on screen, so dismissing the sheet
 * keeps it like Done does, and Cancel is the only way to back out of a change.
 */
const PickerSheet = (props: {
  open: boolean
  onCancel: () => void
  onDone: () => void
  doneTestID?: string
  children: ReactNode
}) => {
  const theme = useTheme()

  return (
    <Sheet
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onDone()
      }}
      backgroundColor={theme.colors.background}
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
    </Sheet>
  )
}

export default PickerSheet
