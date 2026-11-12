import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Map as MapIcon } from 'lucide-react-native'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useLocalDay from '@/hooks/useLocalDay'
import { useFeatureFlag } from '@/lib/featureFlags'
import i18n from '@/lib/locales'
import {
  streetSummary,
  territoryDueText,
  territoryListTitle,
  territoryProgressText,
  territoryTitle,
} from '@/features/territories/lib/territoryTitle'
import { isOverdue } from '@/features/territories/lib/doors'
import {
  handedStreetId,
  isReceivedLive,
} from '@/features/territories/lib/sharing'
import type { Territory } from '@/features/territories/types/territory'
import { useTerritories } from '@/features/territories/stores/territories'
import type { RootStackNavigation } from '@/types/rootStack'

const SHOWN = 3

export const useHasTerritories = () => {
  const enabled = useFeatureFlag('territories')
  const checkedOut = useTerritories((state) =>
    state.territories.some(
      (territory) =>
        territory.finishedAt === undefined && isReceivedLive(territory)
    )
  )
  return enabled && checkedOut
}

export default function TerritoryHomeCard() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const territories = useTerritories((state) => state.territories)
  useLocalDay()
  const open = territories.filter(
    (territory) =>
      territory.finishedAt === undefined && isReceivedLive(territory)
  )
  const active = [
    ...open
      .filter((territory) => !territory.received)
      .sort((a, b) => b.checkedOutAt - a.checkedOutAt),
    ...open
      .filter((territory) => territory.received)
      .sort((a, b) => (b.received?.at ?? 0) - (a.received?.at ?? 0)),
  ].slice(0, SHOWN)
  const lines = (territory: Territory) => {
    const { received } = territory
    if (received?.kind === 'handoff')
      return [
        i18n.t('territories.share.assignedRow', {
          territory: territoryTitle(territory),
          name: received.from.name,
        }),
        territory.streets[0] && streetSummary(territory.streets[0], false),
      ]
    if (received)
      return [
        i18n.t('territories.share.sharedBy', { name: received.from.name }),
        territoryProgressText(territory),
      ]
    return [null, territoryProgressText(territory)]
  }
  const openAll = () =>
    navigation.navigate('Root', { screen: 'Territories' } as never)
  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  }
  const chevron = (
    <LucideIcon
      icon={ChevronForwardIcon}
      size={16}
      color={theme.colors.textAlt}
    />
  )

  return (
    <Card style={{ paddingHorizontal: 0, paddingTop: 8, paddingBottom: 6 }}>
      <HomeSectionMenu
        onPress={openAll}
        accessibilityLabel={i18n.t('territories.homeCard_seeAll')}
      >
        <View
          testID='home-territories-all'
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 44,
            paddingLeft: 20,
            paddingRight: 20,
          }}
        >
          <LucideIcon icon={MapIcon} size={20} color={theme.colors.accent} />
          <Text
            accessibilityRole='header'
            style={{
              flex: 1,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('territories.homeCard_title')}
          </Text>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.accent,
            }}
          >
            {i18n.t('territories.homeCard_seeAll')}
          </Text>
        </View>
      </HomeSectionMenu>
      {active.map((territory, index) => (
        <Button
          key={territory.id}
          noTransform
          testID={index === 0 ? 'home-territory' : `home-territory-${index}`}
          onPress={() => {
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
          style={row}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {territoryListTitle(territory)}
            </Text>
            {territory.received ? null : (
              <Text
                style={{
                  color: isOverdue(territory, Date.now())
                    ? theme.colors.error
                    : theme.colors.textAlt,
                }}
              >
                {territoryDueText(territory, Date.now())}
              </Text>
            )}
            {lines(territory).map(
              (line, index) =>
                line && (
                  <Text key={index} style={{ color: theme.colors.textAlt }}>
                    {line}
                  </Text>
                )
            )}
          </View>
          {chevron}
        </Button>
      ))}
    </Card>
  )
}
