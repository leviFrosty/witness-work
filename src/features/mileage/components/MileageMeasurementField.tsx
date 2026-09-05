import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'

export default function MileageMeasurementField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder: string
}) {
  const theme = useTheme()
  return (
    <View style={{ paddingRight: 20, paddingVertical: 8, gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType='decimal-pad'
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textAlt}
        style={{
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.numbers.borderRadiusSm,
          padding: 12,
          minHeight: 46,
        }}
      />
    </View>
  )
}
