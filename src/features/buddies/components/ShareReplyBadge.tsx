import { Check as CheckIcon, X as XIcon } from 'lucide-react-native'
import { AvatarBadge } from '@/components/ui/Avatar'
import useTheme from '@/contexts/theme'
import type { ShareReply } from '@/features/buddies/lib/schemas'

/** An invited buddy's answer on their avatar; nothing while unanswered. */
export default function ShareReplyBadge({
  status,
  ringColor,
}: {
  status?: ShareReply
  ringColor?: string
}) {
  const theme = useTheme()
  if (!status) return null
  return status === 'going' ? (
    <AvatarBadge
      color={theme.colors.accent}
      icon={CheckIcon}
      ringColor={ringColor}
    />
  ) : (
    <AvatarBadge
      color={theme.colors.error}
      icon={XIcon}
      ringColor={ringColor}
    />
  )
}
