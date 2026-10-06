import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import SharedEventSummary from '@/features/buddies/components/SharedEventSummary'
import ShareAnswerButtons from '@/features/buddies/components/ShareAnswerButtons'
import useAnswerShare from '@/features/buddies/hooks/useAnswerShare'
import type { TogetherItem } from '@/features/buddies/lib/together'

/** The buddy's invitations still waiting on this User; hidden when none. */
export default function BuddyNeedsAnswerSection({
  items,
}: {
  items: TogetherItem[]
}) {
  const theme = useTheme()
  const { busy, answer } = useAnswerShare('buddy_detail')
  if (items.length === 0) return null

  return (
    <BuddiesSection title={i18n.t('buddies_needsAnswer')}>
      {items.map((item, index) =>
        item.direction === 'incoming' ? (
          <View
            key={item.key}
            style={{
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 15,
              borderBottomWidth: index === items.length - 1 ? 0 : 1,
              borderColor: theme.colors.border,
            }}
          >
            <SharedEventSummary
              details={item.details}
              isFollowUp={item.type === 'followUp'}
            />
            <ShareAnswerButtons
              disabled={busy}
              onAnswer={(reply) => answer(item.shareKey, item.type, reply)}
            />
          </View>
        ) : null
      )}
    </BuddiesSection>
  )
}
