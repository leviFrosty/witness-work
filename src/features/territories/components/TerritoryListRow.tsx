import InputRowButton from '@/components/ui/inputs/InputRowButton'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { useTerritoryMenu } from '@/features/territories/hooks/useTerritoryMenu'
import {
  territoryDueText,
  territoryProgressText,
  territoryTitle,
} from '@/features/territories/lib/territoryTitle'
import type { Territory } from '@/features/territories/types/territory'

export default function TerritoryListRow({
  territory,
  onPress,
  lastInSection,
}: {
  territory: Territory
  onPress: () => void
  lastInSection: boolean
}) {
  const theme = useTheme()
  const menu = useTerritoryMenu(territory)
  return (
    <InputRowButton
      label={[territoryTitle(territory), territory.name]
        .filter(Boolean)
        .join(' · ')}
      sublabel={[
        territoryDueText(territory, Date.now()),
        territory.finishedAt === undefined && territoryProgressText(territory),
      ]
        .filter(Boolean)
        .join(' · ')}
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
