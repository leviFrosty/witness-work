import { View } from 'react-native'
import { Users as UsersIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { BuddyShareRef } from '@/types/timeEntry'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Tells the User a Plan follows a buddy's, so their edits may be replaced. */
export default function LinkedPlanBanner({ share }: { share: BuddyShareRef }) {
  const theme = useTheme()
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === share.from)
  )
  if (!buddy) return null

  return (
    <XView
      style={{
        gap: 10,
        padding: 12,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.accentTranslucent,
        alignItems: 'flex-start',
      }}
    >
      <LucideIcon
        icon={UsersIcon}
        size={16}
        color={buddyColor(theme, buddy.colorIndex)}
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text }}>
          {i18n.t('buddies_sharedBy', { name: buddy.name })}
        </Text>
      </View>
    </XView>
  )
}
