import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** The optional name, with the species name as its placeholder. */
export default function PetNameField({
  value,
  onChangeText,
  placeholder,
  maxLength,
  autoFocus,
  onSubmitEditing,
}: {
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  maxLength: number
  autoFocus?: boolean
  onSubmitEditing?: () => void
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('pet.picker.nameLabel')}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        maxLength={maxLength}
        textAlign='start'
        autoCapitalize='words'
        autoCorrect={false}
        returnKeyType='done'
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={i18n.t('pet.picker.nameLabel')}
        style={{
          borderRadius: theme.numbers.borderRadiusMd,
          paddingHorizontal: 12,
          minHeight: 44,
          fontSize: theme.fontSize('md'),
        }}
      />
    </View>
  )
}
