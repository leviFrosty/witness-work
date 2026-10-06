import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'

/**
 * One buddy on Plan Details. Their photo, name, and status open their page; an
 * action (Invite, an info button) sits beside it as its own control.
 */
export default function PlanDetailsBuddyRow({
  buddy,
  badge,
  subtitle,
  status,
  action,
  last,
}: {
  buddy: Buddy
  /** On the photo, e.g. their answer. */
  badge?: ReactNode
  /** Under the name, e.g. "Organizer". */
  subtitle?: string
  /** Right of the name, e.g. "Going". */
  status?: ReactNode
  action?: ReactNode
  last: boolean
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const name = buddyDisplayName(buddy)
  return (
    <XView
      style={{
        gap: 10,
        paddingRight: 15,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      <Button
        onPress={() => navigation.navigate('Buddy', { inboxId: buddy.inboxId })}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
          paddingLeft: 15,
        }}
      >
        <BuddyAvatar avatar={buddy.avatar} name={name} color={buddy} size={32}>
          {badge}
        </BuddyAvatar>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1}>{name}</Text>
          {subtitle ? (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {status}
      </Button>
      {action}
    </XView>
  )
}
