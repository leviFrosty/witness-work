import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import SortDirectionButtons from '@/components/sortFilter/SortDirectionButtons'
import SortFilterOption from '@/components/sortFilter/SortFilterOption'
import SortFilterSection from '@/components/sortFilter/SortFilterSection'
import SortFilterSheet from '@/components/sortFilter/SortFilterSheet'
import i18n from '@/lib/locales'
import useTerritoriesQuery from '@/features/territories/hooks/useTerritoriesQuery'
import {
  matchesTerritoryFilters,
  TERRITORY_FILTERS,
  TERRITORY_SORTS,
} from '@/features/territories/lib/listView'
import { useTerritories } from '@/features/territories/stores/territories'
import type { RootStackNavigation } from '@/types/rootStack'

export default function TerritoriesSortAndFilterScreen() {
  const navigation = useNavigation<RootStackNavigation>()
  const territories = useTerritories((state) => state.territories)
  const {
    sort,
    direction,
    filters,
    isDefault,
    setSort,
    setDirection,
    toggleFilter,
    reset,
  } = useTerritoriesQuery()
  const now = Date.now()

  return (
    <SortFilterSheet
      resultCount={
        territories.filter((territory) =>
          matchesTerritoryFilters(territory, filters, now)
        ).length
      }
      canReset={!isDefault}
      onReset={reset}
      onClose={() => {
        if (navigation.canGoBack()) navigation.goBack()
      }}
    >
      <SortFilterSection
        title={i18n.t('contacts_sortAndFilter_filtersSection')}
      >
        <View style={{ gap: 8 }}>
          {TERRITORY_FILTERS.map((filter) => (
            <SortFilterOption
              key={filter}
              label={i18n.t(`territories.view.filter.${filter}`)}
              selected={filters.includes(filter)}
              onPress={() => toggleFilter(filter)}
              testID={`territories-filter-option-${filter}`}
            />
          ))}
        </View>
      </SortFilterSection>

      <SortFilterSection title={i18n.t('contacts_sortAndFilter_sortSection')}>
        <SortDirectionButtons value={direction} onChange={setDirection} />
        <View style={{ gap: 8 }}>
          {TERRITORY_SORTS.map((key) => (
            <SortFilterOption
              key={key}
              label={i18n.t(`territories.view.sort.${key}`)}
              selected={sort === key}
              onPress={() => setSort(key)}
              testID={`territories-sort-option-${key}`}
            />
          ))}
        </View>
      </SortFilterSection>
    </SortFilterSheet>
  )
}
