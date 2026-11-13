import { SlidersHorizontal as SlidersHorizontalIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import FilterChip from '@/components/ui/FilterChip'
import SortableChipRow from '@/components/ui/SortableChipRow'
import i18n from '@/lib/locales'
import useTerritoriesQuery from '@/features/territories/hooks/useTerritoriesQuery'
import {
  matchesTerritoryFilters,
  TERRITORY_FILTERS,
  type TerritoryFilter,
} from '@/features/territories/lib/listView'
import type { Territory } from '@/features/territories/types/territory'
import type { RootStackNavigation } from '@/types/rootStack'

const FILTERS: TerritoryFilter[] = [...TERRITORY_FILTERS]

export default function TerritoriesFilterChips({
  territories,
}: {
  territories: Territory[]
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const { filters, isSortDefault, toggleFilter, clearFilters } =
    useTerritoriesQuery()
  const now = Date.now()

  return (
    <SortableChipRow
      data={FILTERS}
      keyExtractor={(filter) => filter}
      onReorder={() => {}}
      sortEnabled={false}
      leading={
        <>
          <FilterChip
            label={i18n.t('contacts_sortAndFilter_title')}
            icon={SlidersHorizontalIcon}
            active={!isSortDefault}
            onPress={() => navigation.navigate('Territories Sort And Filter')}
            testID='territories-sort-filter'
          />
          <FilterChip
            label={i18n.t('contacts_stalenessChip_all')}
            count={territories.length}
            active={filters.length === 0}
            onPress={clearFilters}
            testID='territories-filter-all'
          />
        </>
      }
      renderItem={(filter) => (
        <FilterChip
          label={i18n.t(`territories.view.filter.${filter}`)}
          count={
            territories.filter((territory) =>
              matchesTerritoryFilters(territory, [filter], now)
            ).length
          }
          active={filters.includes(filter)}
          onPress={() => toggleFilter(filter)}
          testID={`territories-filter-${filter}`}
        />
      )}
    />
  )
}
