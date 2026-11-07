import { View } from 'react-native'
import { Search as SearchIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  GroupedList,
  GroupedListRow,
  GroupedListSection,
} from '@/components/ui/GroupedList'
import { SETTINGS_SEARCH_PAGE_ICONS } from '@/features/settings/components/search/settingsSearchIcons'
import {
  settingsSearchLocation,
  type SettingsSearchItem,
} from '@/features/settings/lib/settingsSearch'

type Props = {
  results: readonly SettingsSearchItem[]
  onOpen: (item: SettingsSearchItem, index: number) => void
}

export default function SettingsSearchResults({ results, onOpen }: Props) {
  const theme = useTheme()

  if (results.length === 0) {
    return (
      <View
        accessibilityLiveRegion='polite'
        style={{ alignItems: 'center', gap: 12, paddingTop: 48 }}
      >
        <LucideIcon icon={SearchIcon} size={24} color={theme.colors.textAlt} />
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('settingsSearch.noResults')}
        </Text>
      </View>
    )
  }

  return (
    <GroupedList testID='settings-search-results'>
      <GroupedListSection>
        {results.map((item, index) => (
          <GroupedListRow
            key={item.id}
            testID={`settings-search-result-${item.id}`}
            icon={SETTINGS_SEARCH_PAGE_ICONS[item.page]}
            label={i18n.t(item.title)}
            sublabel={settingsSearchLocation(item).join(' › ') || undefined}
            onPress={() => onOpen(item, index)}
          />
        ))}
      </GroupedListSection>
    </GroupedList>
  )
}
