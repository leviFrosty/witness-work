import { Platform, View } from 'react-native'
import { Search as SearchIcon, X as XIcon } from 'lucide-react-native'
import { Input, type InputProps } from 'tamagui'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { alignInput } from '@/lib/direction'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import IconButton from '@/components/ui/IconButton'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

type Props = {
  query: string
  onChangeQuery: (query: string) => void
  onSubmit: () => void
}

export default function SettingsSearchHeader({
  query,
  onChangeQuery,
  onSubmit,
}: Props) {
  const theme = useTheme()
  const foldColumn = useFoldColumn(inputLayout.contentMaxWidth)
  const placeholder = i18n.t('settingsSearch.placeholder')

  return (
    <View
      style={[
        {
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 4,
        },
        foldColumn,
      ]}
    >
      <Text
        accessibilityRole='header'
        style={{
          marginHorizontal: 16,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xl'),
        }}
      >
        {i18n.t('settings')}
      </Text>
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
          testID='settings-search'
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
    </View>
  )
}
