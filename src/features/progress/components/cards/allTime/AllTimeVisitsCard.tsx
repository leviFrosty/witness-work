import { MessagesSquare as VisitsIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { visitStats } from '@/features/progress/lib/periodCardStats'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

export default function AllTimeVisitsCard({ size }: AllTimeCardProps) {
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const stats = visitStats({ contacts, conversations })

  return (
    <StatCard
      icon={VisitsIcon}
      title={i18n.t('progressCards.visits.title')}
      value={formatNumber(stats.talked)}
      tone={stats.talked ? 'default' : 'muted'}
      caption={i18n.t('progressCards.allTime.visits.people', {
        count: stats.people,
      })}
      detail={i18n.t('progressCards.allTime.visits.notAtHome', {
        count: stats.notAtHome,
      })}
      info={i18n.t('progressCards.allTime.visits.info')}
      size={size}
    />
  )
}
