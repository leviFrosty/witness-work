import Card from '@/components/ui/Card'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyRow from '@/features/buddies/components/BuddyRow'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesList() {
  const theme = useTheme()
  const buddies = useBuddies((state) => state.buddies)

  if (buddies.length === 0) {
    return (
      <Card>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('buddies_empty')}
        </Text>
      </Card>
    )
  }

  return (
    <Section style={{ paddingVertical: 0 }}>
      {buddies.map((buddy, index) => (
        <BuddyRow
          key={buddy.inboxId}
          buddy={buddy}
          last={index === buddies.length - 1}
        />
      ))}
    </Section>
  )
}
