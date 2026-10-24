import { View } from 'react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'

/** One place to bring data in from, in the import chooser. */
const ImportOptionCard = ({
  icon,
  color,
  titleKey,
  descKey,
  disabled,
  disabledNoteKey,
  onPress,
}: {
  icon: AppIcon
  color: string
  titleKey: TranslationKey
  descKey: TranslationKey
  disabled?: boolean
  disabledNoteKey?: TranslationKey
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      noTransform
      style={{ marginBottom: 10, opacity: disabled ? 0.5 : 1 }}
    >
      <Card
        flexDirection='row'
        style={{ alignItems: 'center', gap: 14, paddingVertical: 14 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: color,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <LucideIcon icon={icon} size={18} color={theme.colors.textInverse} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t(titleKey)}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t(disabled && disabledNoteKey ? disabledNoteKey : descKey)}
          </Text>
        </View>
      </Card>
    </Button>
  )
}

export default ImportOptionCard
