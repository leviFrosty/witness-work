import { View } from 'react-native'
import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import TerritoryPersonAvatar from '@/features/territories/components/sharing/TerritoryPersonAvatar'
import confirmNeutral from '@/features/territories/lib/confirmNeutral'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import { personById } from '@/features/territories/lib/sharing'
import { handoffSummary } from '@/features/territories/lib/territoryTitle'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export default function StreetHandoffCard({
  territory,
  street,
}: {
  territory: Territory
  street: TerritoryStreet
}) {
  const theme = useTheme()
  const { buddies, actions } = useTerritorySharing()
  const handoff = street.handoff
  if (!handoff) return null
  const person = personById(territory, handoff.personId)
  const name = person?.name ?? i18n.t('territories.share.someone')
  const buddy = buddies.find((entry) => entry.inboxId === person?.inboxId)
  const worked = street.workedAt !== undefined

  const takeBack = () =>
    confirmNeutral({
      title: i18n.t('territories.share.takeBack_title', {
        street: street.name,
      }),
      description: i18n.t('territories.share.takeBack_description', { name }),
      confirmLabel: i18n.t('territories.share.takeBack'),
      onConfirm: () =>
        void actions.endHandoff(territory.id, street.id).then((taken) => {
          if (taken)
            toast.success(
              i18n.t('territories.share.takenBack_toast', {
                street: street.name,
              })
            )
        }),
    })

  return (
    <Card style={{ gap: 16 }} testID='street-handoff-card'>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TerritoryPersonAvatar
          name={name}
          avatar={buddy?.avatar}
          color={buddy?.color}
          size={40}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {worked
              ? handoffSummary(street, name)
              : i18n.t('territories.share.handedOffCard', { name })}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {handoff.pending
              ? i18n.t('territories.share.handedOffCard_waiting', { name })
              : i18n.t('territories.share.handedOffCard_since', {
                  date: formatDate(handoff.at, { style: 'medium' }),
                })}
          </Text>
        </View>
        {worked && (
          <LucideIcon
            icon={CircleCheckIcon}
            size={24}
            color={theme.colors.accent}
          />
        )}
      </View>
      <Button
        variant='outline'
        onPress={takeBack}
        testID='street-take-back'
        style={{
          minHeight: 48,
          paddingVertical: 12,
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('territories.share.takeBack')}
        </Text>
      </Button>
    </Card>
  )
}
