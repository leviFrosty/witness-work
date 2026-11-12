import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  CircleCheck as CircleCheckIcon,
  Circle as CircleIcon,
} from 'lucide-react-native'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import StreetHandoffPicker from '@/features/territories/components/sharing/StreetHandoffPicker'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import useHandOffStreet from '@/features/territories/hooks/useHandOffStreet'
import { workingStreets } from '@/features/territories/lib/doors'
import { useTerritory } from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryHandoff'>

export default function TerritoryHandoffScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId } = route.params
  const territory = useTerritory(territoryId)
  const [streetId, setStreetId] = useState(route.params.streetId)
  const handOff = useHandOffStreet(territoryId, () =>
    navigation.popTo('TerritoryDetails', { territoryId })
  )

  if (!territory || territory.received) return null

  const asking = route.params.streetId === undefined
  const streets = workingStreets(territory)
  const street = territory.streets.find((entry) => entry.id === streetId)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        noInsets
        buttonType='back'
        title={
          street && !asking
            ? i18n.t('territories.share.handOffTitle', { street: street.name })
            : i18n.t('territories.share.handOffAStreet')
        }
      />
      <ScrollView>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
            gap: 20,
          }}
        >
          {asking && (
            <View style={{ gap: 8 }}>
              <TerritorySectionTitle>
                {i18n.t('territories.share.handOffWhich')}
              </TerritorySectionTitle>
              <Section>
                {streets.map((entry, index) => {
                  const on = entry.id === streetId
                  return (
                    <InputRowButton
                      key={entry.id}
                      label={entry.name}
                      checked={on}
                      onPress={() => setStreetId(entry.id)}
                      lastInSection={index === streets.length - 1}
                    >
                      <LucideIcon
                        icon={on ? CircleCheckIcon : CircleIcon}
                        size={22}
                        color={on ? theme.colors.accent : theme.colors.border}
                      />
                    </InputRowButton>
                  )
                })}
              </Section>
            </View>
          )}
          <StreetHandoffPicker
            ready={!!street}
            onHandOff={(buddy) => street && handOff(street, buddy)}
            onOpenBuddies={() => navigation.navigate('Buddies')}
          />
        </ContentColumn>
      </ScrollView>
    </View>
  )
}
