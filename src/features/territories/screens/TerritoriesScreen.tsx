import { ScrollView, View } from 'react-native'
import { useEffect } from 'react'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import {
  SlidersHorizontal as SlidersHorizontalIcon,
  Map as MapIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import SortSummary from '@/components/sortFilter/SortSummary'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'
import i18n from '@/lib/locales'
import TerritoriesFilterChips from '@/features/territories/components/TerritoriesFilterChips'
import useTerritoriesQuery from '@/features/territories/hooks/useTerritoriesQuery'
import TerritoriesTabHeader from '@/features/territories/components/TerritoriesTabHeader'
import TerritoryReceivedSection from '@/features/territories/components/sharing/TerritoryReceivedSection'
import TerritoryReturnedGroup from '@/features/territories/components/TerritoryReturnedGroup'
import TerritoryListRow from '@/features/territories/components/TerritoryListRow'
import {
  DEFAULT_TERRITORIES_QUERY,
  matchesTerritoryFilters,
  sortTerritories,
} from '@/features/territories/lib/listView'
import { handedStreetId } from '@/features/territories/lib/sharing'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import { useTerritories } from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'
import type { HomeTabStackParamList } from '@/types/homeStack'
import type { RootStackNavigation } from '@/types/rootStack'

export default function TerritoriesScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { hasBottomBar } = useAdaptiveLayout()
  const tabBarHeight = useBottomTabBarHeight()
  const bars = useHideBarsOnScroll()
  const navigation = useNavigation<RootStackNavigation>()
  const territories = useTerritories((state) => state.territories)
  useDoorRecordPrivacy()

  const { sort, direction, filters, isSortDefault, clearFilters } =
    useTerritoriesQuery()
  const order = { sort, direction }

  const now = Date.now()
  const shown = territories.filter((territory) =>
    matchesTerritoryFilters(territory, filters, now)
  )
  const checkedOut = (list: Territory[]) =>
    list.filter(
      (territory) => !territory.received && territory.finishedAt === undefined
    )
  const active = sortTerritories(
    checkedOut(shown),
    order,
    (territory) => territory.checkedOutAt
  )
  const finished = sortTerritories(
    shown.filter(
      (territory) => !territory.received && territory.finishedAt !== undefined
    ),
    sort === 'number' || sort === 'recent' ? order : DEFAULT_TERRITORIES_QUERY,
    (territory) => territory.finishedAt ?? 0
  )

  const resume =
    useRoute<RouteProp<HomeTabStackParamList, 'Territories'>>().params?.resume
  const working = checkedOut(territories)
  const only = working.length === 1 ? working[0]?.id : undefined
  useEffect(() => {
    if (!resume) return
    navigation.setParams({ resume: false })
    if (only) navigation.navigate('TerritoryDetails', { territoryId: only })
  }, [resume, only, navigation])

  const add = () => navigation.navigate('TerritoryForm')

  const rows = (list: Territory[]) =>
    list.map((territory, index) => (
      <TerritoryListRow
        key={territory.id}
        territory={territory}
        onPress={() =>
          navigation.navigate('TerritoryDetails', { territoryId: territory.id })
        }
        lastInSection={index === list.length - 1}
      />
    ))

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TerritoriesTabHeader hidden={bars.hidden} onAdd={add} />
      <ScrollView {...bars.scrollProps}>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: (hasBottomBar ? tabBarHeight : insets.bottom) + 40,
            gap: 24,
          }}
        >
          {territories.length === 0 && (
            <Empty
              style={{ marginTop: 40 }}
              icon={
                <LucideIcon
                  icon={MapIcon}
                  size={28}
                  color={theme.colors.textAlt}
                />
              }
              title={i18n.t('territories.emptyTitle')}
              description={i18n.t('territories.emptyDescription')}
              action={
                <ActionButton onPress={add} submitShortcut={false}>
                  {i18n.t('territories.add')}
                </ActionButton>
              }
            />
          )}
          {territories.length > 0 && (
            <View
              style={{
                marginHorizontal: -inputLayout.horizontalPadding,
                gap: 10,
              }}
            >
              <TerritoriesFilterChips territories={territories} />
              {!isSortDefault && (
                <SortSummary
                  label={i18n.t(`territories.view.sort.${sort}`)}
                  direction={direction}
                  style={{ paddingHorizontal: 12 }}
                />
              )}
            </View>
          )}
          {territories.length > 0 && shown.length === 0 && (
            <Empty
              style={{ marginTop: 40 }}
              testID='territories-none-match'
              icon={
                <LucideIcon
                  icon={SlidersHorizontalIcon}
                  size={28}
                  color={theme.colors.textAlt}
                />
              }
              title={i18n.t('territories.view.noMatchTitle')}
              description={i18n.t('territories.view.noMatchDescription')}
              action={
                <ActionButton onPress={clearFilters} submitShortcut={false}>
                  {i18n.t('territories.view.clearFilters')}
                </ActionButton>
              }
            />
          )}
          {active.length > 0 && (
            <View style={{ gap: 8 }}>
              <TerritorySectionTitle>
                {i18n.t('territories.checkedOut')}
              </TerritorySectionTitle>
              <Section>{rows(active)}</Section>
            </View>
          )}
          {(['handoff', 'shared'] as const).map((kind) => (
            <TerritoryReceivedSection
              key={kind}
              kind={kind}
              territories={shown}
              sort={order}
              onOpen={(territory) => {
                const streetId = handedStreetId(territory)
                if (streetId)
                  return navigation.navigate('TerritoryStreet', {
                    territoryId: territory.id,
                    streetId,
                  })
                navigation.navigate('TerritoryDetails', {
                  territoryId: territory.id,
                })
              }}
            />
          ))}
          {finished.length > 0 && (
            <TerritoryReturnedGroup count={finished.length}>
              <Section>{rows(finished)}</Section>
            </TerritoryReturnedGroup>
          )}
        </ContentColumn>
      </ScrollView>
    </View>
  )
}
