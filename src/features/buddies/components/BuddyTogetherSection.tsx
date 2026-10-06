import { useState } from 'react'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyTogetherRow from '@/features/buddies/components/BuddyTogetherRow'
import useAnswerShare from '@/features/buddies/hooks/useAnswerShare'
import type { TogetherItem } from '@/features/buddies/lib/together'

/** Past this many, the rest wait behind "See All". */
const COLLAPSED_COUNT = 3

/**
 * Upcoming Plans and Follow-ups with this buddy, whoever invited whom; hidden
 * when there are none.
 */
export default function BuddyTogetherSection({
  items,
  buddyName,
}: {
  items: TogetherItem[]
  buddyName: string
}) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const { busy, answer } = useAnswerShare('buddy_detail')
  if (items.length === 0) return null

  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT)
  const collapsible = items.length > COLLAPSED_COUNT

  return (
    <BuddiesSection title={i18n.t('buddies_together')}>
      {visible.map((item, index) => (
        <BuddyTogetherRow
          key={item.key}
          item={item}
          buddyName={buddyName}
          busy={busy}
          last={!collapsible && index === visible.length - 1}
          onAnswer={(reply) =>
            item.direction === 'incoming' &&
            answer(item.shareKey, item.type, reply)
          }
        />
      ))}
      {collapsible ? (
        <Button
          onPress={() => setExpanded(!expanded)}
          style={{ paddingVertical: 12, paddingHorizontal: 15 }}
        >
          <Text style={{ color: theme.colors.accent }}>
            {expanded
              ? i18n.t('buddies_showFewer')
              : i18n.t('buddies_seeAllCount', { count: items.length })}
          </Text>
        </Button>
      ) : null}
    </BuddiesSection>
  )
}
