import { Map as MapIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import useNow from '@/hooks/useNow'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import type { RootStackNavigation } from '@/types/rootStack'
import { TERRITORY_FIXTURE_ID_PREFIX } from '@/app/dev-fixtures/territories'
import { forgetInsightsNotification } from '@/app/dev-harness/territories'
import { ToolList, ToolRow, ToolSection } from '@/app/navigation/tools/ToolsUI'
import { territoryInsights } from '@/features/territories/lib/insights'
import { useTerritories } from '@/features/territories/stores/territories'
import {
  resetVisitTally,
  useTerritoryVisits,
} from '@/features/territories/stores/territoryVisits'

const isFixture = (territory: { id: string }) =>
  territory.id.startsWith(TERRITORY_FIXTURE_ID_PREFIX)

export default function TerritoryTools() {
  const navigation = useNavigation<RootStackNavigation>()
  const territories = useTerritories((state) => state.territories)
  const { now } = useNow()
  const tally = useTerritoryVisits()
  const insights = territoryInsights(Object.values(tally.territories), { now })
  const fixtures = territories.filter(isFixture)

  return (
    <ToolSection
      title='Territories'
      icon={MapIcon}
      summary={`${territories.length} territories · ${insights.total} visits counted in ${Object.keys(tally.territories).length}`}
    >
      <ToolList>
        <ToolRow
          label='Insights'
          value={
            insights.ready
              ? `Ready ${tally.seenAt ? '· seen' : '· not seen'}`
              : `${insights.remaining} more doors`
          }
        />
        <ToolRow
          label='Open Insights'
          onPress={() => navigation.navigate('TerritoryInsights')}
        />
        <ToolRow
          label='Reset insights'
          info='Starts the visit tally over from the doors recorded now, and brings back the "insights are ready" tray notification.'
          onPress={() => {
            resetVisitTally()
            forgetInsightsNotification()
            toast.info('Insights reset')
          }}
        />
        <ToolRow
          label='Delete generated territories'
          info='Removes the sample territories (dev-territory- ids). Their visits stay counted until you reset insights.'
          tone='destructive'
          onPress={() =>
            confirmDestructive({
              title: 'Delete generated territories',
              description: `${fixtures.length} territories`,
              onConfirm: () => {
                const { remove } = useTerritories.getState()
                fixtures.forEach((territory) => remove(territory.id))
                toast.info(i18n.t('deleted'))
              },
            })
          }
        />
      </ToolList>
    </ToolSection>
  )
}
