import { ScrollView, View } from 'react-native'
import { useEffect } from 'react'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { Map as MapIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'
import i18n from '@/lib/locales'
import TerritoriesTabHeader from '@/features/territories/components/TerritoriesTabHeader'
import TerritoryReceivedSection from '@/features/territories/components/sharing/TerritoryReceivedSection'
import TerritoryReturnedGroup from '@/features/territories/components/TerritoryReturnedGroup'
import TerritoryListRow from '@/features/territories/components/TerritoryListRow'
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

  const owned = territories.filter((territory) => !territory.received)
  const active = owned
    .filter((territory) => territory.finishedAt === undefined)
    .sort((a, b) => b.checkedOutAt - a.checkedOutAt)
  const finished = owned
    .filter((territory) => territory.finishedAt !== undefined)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))

  const resume =
    useRoute<RouteProp<HomeTabStackParamList, 'Territories'>>().params?.resume
  const only = active.length === 1 ? active[0]?.id : undefined
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
              territories={territories}
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
