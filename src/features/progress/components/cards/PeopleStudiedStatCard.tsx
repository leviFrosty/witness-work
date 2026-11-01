import { BookOpenCheck as StudyIcon } from 'lucide-react-native'
import type moment from 'moment'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import type { ProgressCardSize } from '@/lib/progressCards'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  studyStats,
  type StudyStats,
} from '@/features/progress/lib/periodCardStats'
import StatCard from '@/features/progress/components/cards/StatCard'

export default function PeopleStudiedStatCard({
  inRange,
  peakCaption,
  none,
  info,
  size,
}: {
  inRange?: (date: moment.Moment) => boolean
  peakCaption: (peak: NonNullable<StudyStats['peak']>) => string

  none: string
  info: string
  size: ProgressCardSize
}) {
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const stats = studyStats({ contacts, conversations, inRange })
  const names = contacts
    .filter((c) => stats.contactIds.has(c.id))
    .map((c) => c.name)
    .filter(Boolean)
  const shown = names.slice(0, 3).join(', ')
  const count = stats.contactIds.size

  return (
    <StatCard
      icon={StudyIcon}
      title={i18n.t('studies')}
      value={formatNumber(count)}
      suffix={i18n.t('progressCards.studiesPeople.unit', { count })}
      tone={count ? 'default' : 'muted'}
      caption={stats.peak ? peakCaption(stats.peak) : none}
      detail={
        names.length > 3
          ? i18n.t('progressCards.studies.namesMore', {
              names: shown,
              more: formatNumber(names.length - 3),
            })
          : shown || undefined
      }
      info={info}
      size={size}
    />
  )
}
