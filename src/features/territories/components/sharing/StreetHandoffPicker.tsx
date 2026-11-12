import { useState } from 'react'
import { View } from 'react-native'
import { UserPlus as UserPlusIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import PersonPickRow from '@/features/territories/components/sharing/PersonPickRow'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import useTerritorySharing, {
  type TerritoryBuddy,
} from '@/features/territories/hooks/useTerritorySharing'

export default function StreetHandoffPicker({
  ready,
  onHandOff,
  onOpenBuddies,
}: {
  ready: boolean
  onHandOff: (buddy: TerritoryBuddy) => void
  onOpenBuddies: () => void
}) {
  const theme = useTheme()
  const sharing = useTerritorySharing()
  const [inboxId, setInboxId] = useState<string | null>(null)
  const buddy = sharing.buddies.find((entry) => entry.inboxId === inboxId)

  return (
    <>
      <View style={{ gap: 8 }}>
        <TerritorySectionTitle>
          {i18n.t('territories.share.handOffTo')}
        </TerritorySectionTitle>
        <Section>
          {sharing.buddies.length === 0 ? (
            <InputRowButton
              leftIcon={UserPlusIcon}
              label={i18n.t('territories.share.noBuddies')}
              sublabel={i18n.t('territories.share.noBuddies_description')}
              onPress={sharing.canOpenBuddies ? onOpenBuddies : undefined}
              lastInSection
            >
              {sharing.canOpenBuddies && (
                <LucideIcon
                  icon={ChevronForwardIcon}
                  size={14}
                  color={theme.colors.textAlt}
                />
              )}
            </InputRowButton>
          ) : (
            sharing.buddies.map((entry, index) => (
              <PersonPickRow
                key={entry.inboxId}
                buddy={entry}
                single
                picked={entry.inboxId === inboxId}
                onPress={() => setInboxId(entry.inboxId)}
                last={index === sharing.buddies.length - 1}
              />
            ))
          )}
        </Section>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            paddingHorizontal: 5,
          }}
        >
          {i18n.t('territories.share.handOff_hint')}
        </Text>
      </View>
      {sharing.buddies.length > 0 && (
        <ActionButton
          testID='territory-handoff-confirm'
          disabled={!buddy || !ready}
          submitShortcut={false}
          onPress={() => buddy && onHandOff(buddy)}
        >
          {!ready
            ? i18n.t('territories.share.handOffPickStreet')
            : buddy
              ? i18n.t('territories.share.handOffToName', { name: buddy.name })
              : i18n.t('territories.share.handOffPick')}
        </ActionButton>
      )}
    </>
  )
}
