import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import SearchField from '@/components/ui/SearchField'
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
      <SearchField
        testID='settings-search'
        query={query}
        onChangeQuery={onChangeQuery}
        onSubmit={onSubmit}
        placeholder={i18n.t('settingsSearch.placeholder')}
      />
    </View>
  )
}
