import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

function FooterButton({
  label,
  testID,
  color,
  onPress,
}: {
  label: string
  testID: string
  color: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Button
      testID={testID}
      onPress={onPress}
      style={{
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 12,
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: theme.fonts.semiBold, color }}>{label}</Text>
    </Button>
  )
}

export default function GuestPageFooter({
  name,
  onChangeName,
  onForget,
}: {
  name: string | null
  onChangeName: () => void
  onForget: () => void
}) {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 4, paddingTop: 10 }}>
      {name && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('territories.guest.recordingAs', { name })}
          </Text>
          <FooterButton
            testID='guest-change-name'
            label={i18n.t('territories.guest.changeName')}
            color={theme.colors.accent}
            onPress={onChangeName}
          />
        </View>
      )}
      <FooterButton
        testID='guest-forget'
        label={i18n.t('territories.guest.forget')}
        color={theme.colors.error}
        onPress={onForget}
      />
    </View>
  )
}
