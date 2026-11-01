import { MessagesSquare as VisitsIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { visitStats } from '@/features/progress/lib/periodCardStats'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function YearVisitsCard({ serviceYear, size }: YearCardProps) {
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const stats = visitStats({
    contacts,
    conversations,
    inRange: (date) => getServiceYearFromDate(date) === serviceYear,
  })

  return (
    <StatCard
      icon={VisitsIcon}
      title={i18n.t('progressCards.visits.title')}
      value={formatNumber(stats.talked)}
      tone={stats.talked ? 'default' : 'muted'}
      caption={i18n.t('progressCards.year.visits.notAtHome', {
        count: stats.notAtHome,
      })}
      detail={i18n.t('progressCards.visits.newContacts', {
        count: stats.newContacts,
      })}
      info={i18n.t('progressCards.year.visits.info')}
      size={size}
    />
  )
}
