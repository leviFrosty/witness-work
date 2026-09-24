import { Alert, Switch, View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import type { Buddy } from '@/features/buddies/lib/state'

export default function BuddyRow({
  buddy,
  last,
}: {
  buddy: Buddy
  last: boolean
}) {
  const theme = useTheme()
  const awaiting = buddy.status === 'awaitingConfirm'

  const confirmRemove = () =>
    Alert.alert(
      i18n.t('buddies_removeTitle', { name: buddy.name }),
      i18n.t('buddies_removeBody', { name: buddy.name }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('buddies_remove'),
          style: 'destructive',
          onPress: () =>
            buddiesEngine
              .removeBuddy(buddy.inboxId)
              .catch((error) => Alert.alert(buddiesErrorMessage(error))),
        },
      ]
    )

  return (
    <View
      style={{
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      <XView style={{ gap: 10 }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: buddyColor(theme, buddy.colorIndex),
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{buddy.name}</Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {awaiting
              ? i18n.t('buddies_awaitingConfirm', { name: buddy.name })
              : i18n.t('buddies_sharingPlans')}
          </Text>
        </View>
        <Button onPress={confirmRemove} style={{ paddingVertical: 6 }}>
          <Text style={{ color: theme.colors.error }}>
            {i18n.t('buddies_remove')}
          </Text>
        </Button>
      </XView>
      {!awaiting && (
        <XView style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('buddies_showOnCalendar')}
          </Text>
          <Switch
            value={buddy.showOnCalendar}
            onValueChange={(value) =>
              buddiesEngine.setShowOnCalendar(buddy.inboxId, value)
            }
          />
        </XView>
      )}
    </View>
  )
}
