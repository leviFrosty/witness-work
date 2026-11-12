import { View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import { useTerritoryMenu } from '@/features/territories/hooks/useTerritoryMenu'
import { isReceivedLive } from '@/features/territories/lib/sharing'
import {
  streetSummary,
  territoryListTitle,
  territoryProgressText,
  territoryTitle,
} from '@/features/territories/lib/territoryTitle'
import type { Territory } from '@/features/territories/types/territory'

export default function TerritoryReceivedSection({
  kind,
  territories,
  onOpen,
}: {
  kind: 'handoff' | 'shared'
  territories: Territory[]
  onOpen: (territory: Territory) => void
}) {
  const list = territories
    .filter((territory) => territory.received?.kind === kind)
    .sort((a, b) => (b.received?.at ?? 0) - (a.received?.at ?? 0))
  if (list.length === 0) return null

  const sublabel = (territory: Territory) => {
    const from = territory.received?.from.name ?? ''
    if (!isReceivedLive(territory))
      return i18n.t('territories.share.receivedEnded')
    if (kind === 'shared')
      return [
        i18n.t('territories.share.sharedBy', { name: from }),
        territoryProgressText(territory),
      ].join(' · ')
    const street = territory.streets[0]
    return [
      i18n.t('territories.share.assignedRow', {
        territory: territoryTitle(territory),
        name: from,
      }),
      street && streetSummary(street, false),
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <View style={{ gap: 8 }} testID={`territories-received-${kind}`}>
      <TerritorySectionTitle>
        {i18n.t(
          kind === 'handoff'
            ? 'territories.share.handedToMe'
            : 'territories.share.sharedWithMe'
        )}
      </TerritorySectionTitle>
      <Section>
        {list.map((territory, index) => (
          <ReceivedRow
            key={territory.id}
            territory={territory}
            sublabel={sublabel(territory)}
            onPress={() => onOpen(territory)}
            lastInSection={index === list.length - 1}
          />
        ))}
      </Section>
    </View>
  )
}

function ReceivedRow({
  territory,
  sublabel,
  onPress,
  lastInSection,
}: {
  territory: Territory
  sublabel: string
  onPress: () => void
  lastInSection: boolean
}) {
  const theme = useTheme()
  const menu = useTerritoryMenu(territory)
  return (
    <InputRowButton
      testID={`territory-received-${territory.id}`}
      label={territoryListTitle(territory)}
      sublabel={sublabel}
      onPress={onPress}
      contextActions={menu}
      lastInSection={lastInSection}
      style={{ paddingTop: 12, paddingBottom: 12 }}
    >
      <LucideIcon
        icon={ChevronForwardIcon}
        size={14}
        color={theme.colors.textAlt}
      />
    </InputRowButton>
  )
}
