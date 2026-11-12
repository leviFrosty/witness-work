import { View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import { doorsInWalkingOrder } from '@/features/territories/lib/doors'
import { doorTitle } from '@/features/territories/lib/territoryTitle'
import type { TerritoryStreet } from '@/features/territories/types/territory'

export default function TerritoryNotHomeSection({
  streets,
  onOpen,
}: {
  streets: TerritoryStreet[]
  onOpen: (street: TerritoryStreet) => void
}) {
  const theme = useTheme()
  const rows = streets.flatMap((street) => {
    const doors = doorsInWalkingOrder(
      street.doors.filter((door) => door.outcome === 'notHome'),
      street.descending
    )
    return doors.length > 0 ? [{ street, doors }] : []
  })
  if (rows.length === 0) return null

  return (
    <View style={{ gap: 8 }}>
      <TerritorySectionTitle info={i18n.t('territories.notHomes_info')}>
        {i18n.t('territories.notHomes')}
      </TerritorySectionTitle>
      <Section>
        {rows.map(({ street, doors }, index) => (
          <InputRowButton
            key={street.id}
            label={street.name}
            sublabel={doors
              .map((door) => doorTitle(street, door.label))
              .join(', ')}
            onPress={() => onOpen(street)}
            lastInSection={index === rows.length - 1}
            style={{ paddingTop: 12, paddingBottom: 12 }}
          >
            <LucideIcon
              icon={ChevronForwardIcon}
              size={14}
              color={theme.colors.textAlt}
            />
          </InputRowButton>
        ))}
      </Section>
    </View>
  )
}
