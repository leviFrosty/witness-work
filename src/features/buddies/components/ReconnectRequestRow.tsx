import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import ReconnectButtons from '@/features/buddies/components/ReconnectButtons'
import useReconnect from '@/features/buddies/hooks/useReconnect'
import i18n from '@/lib/locales'

/**
 * A buddy's reconnect whose old pairing is already gone (their old key left
 * it), so it has no buddy row to show on: listed with the requests.
 */
export default function ReconnectRequestRow({
  from,
  last,
}: {
  from: string
  last: boolean
}) {
  const { offer, name, busy, reconnect, dismiss } = useReconnect(from)
  if (!offer) return null
  return (
    <BuddyListRow
      last={last}
      leading={<BuddyAvatar avatar={offer.avatar} name={name} color={offer} />}
      title={name}
      subtitle={i18n.t('buddies_reconnectAsked')}
      actions={
        busy
          ? []
          : [
              {
                id: 'reconnect',
                title: i18n.t('buddies_reconnect'),
                systemImage: 'person.2',
                onPress: () => void reconnect(),
              },
              [
                {
                  id: 'dismiss',
                  title: i18n.t('dismiss'),
                  systemImage: 'xmark.circle',
                  destructive: true,
                  onPress: dismiss,
                },
              ],
            ]
      }
      trailing={<ReconnectButtons from={from} />}
    />
  )
}
