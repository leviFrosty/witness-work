import { Platform, View } from 'react-native'
import { Search as SearchIcon, X as XIcon } from 'lucide-react-native'
import { Input, type InputProps } from 'tamagui'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { alignInput } from '@/lib/direction'
import LucideIcon from '@/components/ui/LucideIcon'
import IconButton from '@/components/ui/IconButton'

type Props = {
  query: string
  onChangeQuery: (query: string) => void
  placeholder: string
  onSubmit?: () => void
  testID?: string
}

export default function SearchField({
  query,
  onChangeQuery,
  placeholder,
  onSubmit,
  testID,
}: Props) {
  const theme = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        minHeight: 44,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon
        icon={SearchIcon}
        size={theme.fontSize('xs')}
        style={{ color: theme.colors.textAlt }}
      />
      <Input
        unstyled
        testID={testID}
        value={query}
        onChangeText={onChangeQuery}
        onSubmitEditing={onSubmit}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={
          theme.colors.textAlt as InputProps['placeholderTextColor']
        }
        clearButtonMode='while-editing'
        enterKeyHint='search'
        returnKeyType='search'
        autoCorrect={false}
        autoCapitalize='none'
        style={{
          flex: 1,
          minHeight: 44,
          color: theme.colors.text,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize('md'),
          textAlign: alignInput('start'),
        }}
      />
      {Platform.OS !== 'ios' && query ? (
        <IconButton
          icon={XIcon}
          accessibilityLabel={i18n.t('clear')}
          onPress={() => onChangeQuery('')}
          color={theme.colors.textAlt}
          style={{
            width: 48,
            height: 48,
            marginEnd: -12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      ) : null}
    </View>
  )
}
