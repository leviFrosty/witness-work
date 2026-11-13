import { UserPlus as UserPlusIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'

export default function BuddiesNeededRow({
  onOpenBuddies,
}: {
  onOpenBuddies: () => void
}) {
  const theme = useTheme()
  const { buddiesSetUp, canOpenBuddies } = useTerritorySharing()

  return (
    <InputRowButton
      testID='territory-share-no-buddies'
      leftIcon={UserPlusIcon}
      label={
        buddiesSetUp
          ? i18n.t('territories.share.noBuddies')
          : i18n.t('territories.share.setUpBuddies')
      }
      sublabel={
        buddiesSetUp
          ? i18n.t('territories.share.noBuddies_description')
          : i18n.t('territories.share.setUpBuddies_description')
      }
      onPress={canOpenBuddies ? onOpenBuddies : undefined}
      lastInSection
    >
      {canOpenBuddies && (
        <LucideIcon
          icon={ChevronForwardIcon}
          size={14}
          color={theme.colors.textAlt}
        />
      )}
    </InputRowButton>
  )
}
