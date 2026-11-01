import { BookOpenCheck as StudyIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { getStudyContactsForGivenMonth } from '@/lib/contacts'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

export default function BibleStudiesCard({
  month,
  year,
  size,
}: ProgressCardProps) {
  const contacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)
  const studied = getStudyContactsForGivenMonth({
    contacts,
    conversations,
    month: new Date(year, month, 15),
  })
  const names = studied.map((c) => c.name).filter(Boolean)
  const shown = names.slice(0, 3).join(', ')

  return (
    <StatCard
      icon={StudyIcon}
      title={i18n.t('studies')}
      value={formatNumber(studied.length)}
      tone={studied.length ? 'default' : 'muted'}
      caption={i18n.t('progressCards.studies.caption')}
      info={i18n.t('progressCards.studies.info')}
      detail={
        names.length > 3
          ? i18n.t('progressCards.studies.namesMore', {
              names: shown,
              more: formatNumber(names.length - 3),
            })
          : shown || undefined
      }
      size={size}
    />
  )
}
