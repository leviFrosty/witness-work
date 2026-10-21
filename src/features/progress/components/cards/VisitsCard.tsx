import { MessagesSquare as VisitsIcon } from 'lucide-react-native'
import moment from 'moment'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { visitStats } from '@/features/progress/lib/periodCardStats'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

/** This month's Visits where someone was home, and the new Contacts. */
export default function VisitsCard({ month, year, size }: ProgressCardProps) {
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const shown = moment({ year, month, day: 1 })
  const { talked, notAtHome, newContacts } = visitStats({
    contacts,
    conversations,
    inRange: (date) => date.isSame(shown, 'month'),
  })

  return (
    <StatCard
      icon={VisitsIcon}
      title={i18n.t('progressCards.visits.title')}
      value={formatNumber(talked)}
      tone={talked ? 'default' : 'muted'}
      caption={
        // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        i18n.t('progressCards.visits.notAtHome', { count: notAtHome })
      }
      detail={
        // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        i18n.t('progressCards.visits.newContacts', { count: newContacts })
      }
      info={i18n.t('progressCards.visits.info')}
      size={size}
    />
  )
}
