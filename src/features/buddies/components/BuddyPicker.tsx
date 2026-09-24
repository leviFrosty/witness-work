import { Pressable, View } from 'react-native'
import { Check as CheckIcon } from 'lucide-react-native'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import type { ReceivedReply } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type Props = {
  /** Invited buddies' inbox ids. */
  value: string[]
  onChange: (inboxIds: string[]) => void
  /** What the invited buddies receive. */
  description: string
  /** Replies so far, by inbox id, for an already-saved share. */
  replies?: Record<string, ReceivedReply>
  lastInSection?: boolean
}

/**
 * Toggles which buddies are invited to a Plan or Follow-up. Hidden until the
 * User has an active buddy.
 */
export default function BuddyPicker({
  value,
  onChange,
  description,
  replies,
  lastInSection,
}: Props) {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies).filter(
    (buddy) => buddy.status === 'active'
  )
  if (!enabled || buddies.length === 0) return null

  const selected = new Set(value)
  const toggle = (inboxId: string) =>
    onChange(
      selected.has(inboxId)
        ? value.filter((id) => id !== inboxId)
        : [...value, inboxId]
    )

  return (
    <InputRowContainer
      label={i18n.t('buddies_inviteBuddies')}
      description={description}
      controlWidth='full'
      lastInSection={lastInSection}
      style={{ gap: 10 }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {buddies.map((buddy) => {
          const isSelected = selected.has(buddy.inboxId)
          const reply = isSelected ? replies?.[buddy.inboxId] : undefined
          const status = isSelected
            ? reply
              ? i18n.t(
                  reply.status === 'going'
                    ? 'buddies_replyGoing'
                    : 'buddies_replyDeclined'
                )
              : replies
                ? i18n.t('buddies_replyInvited')
                : undefined
            : undefined
          return (
            <Pressable
              key={buddy.inboxId}
              onPress={() => toggle(buddy.inboxId)}
              accessibilityRole='checkbox'
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={
                status ? `${buddy.name}, ${status}` : buddy.name
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: isSelected
                  ? theme.colors.accent
                  : theme.colors.border,
                backgroundColor: isSelected
                  ? theme.colors.accentTranslucent
                  : undefined,
              }}
            >
              {isSelected ? (
                <LucideIcon
                  icon={CheckIcon}
                  size={14}
                  color={theme.colors.accent}
                />
              ) : (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: buddyColor(theme, buddy.colorIndex),
                  }}
                />
              )}
              <Text style={{ fontFamily: theme.fonts.semiBold }}>
                {buddy.name}
              </Text>
              {status && (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {status}
                </Text>
              )}
            </Pressable>
          )
        })}
      </View>
    </InputRowContainer>
  )
}
