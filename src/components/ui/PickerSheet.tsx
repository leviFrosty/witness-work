import { ReactNode } from 'react'
import { Platform, View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const PickerSheet = (props: {
  open: boolean
  onCancel: () => void
  onDone: () => void
  doneTestID?: string

  title?: string
  children: ReactNode
}) => {
  const theme = useTheme()

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
          submitShortcut
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
