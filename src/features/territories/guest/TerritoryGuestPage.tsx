import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import { formatDateTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import GuestPageBody from '@/features/territories/components/sharing/GuestPageBody'
import GuestNotice from '@/features/territories/guest/GuestNotice'
import GuestPageFooter from '@/features/territories/guest/GuestPageFooter'
import GuestStatusView from '@/features/territories/guest/GuestStatusView'
import type { GuestStatus } from '@/features/territories/guest/session'
import useGuestSession from '@/features/territories/guest/useGuestSession'
import {
  type GuestView,
  projectGuestView,
} from '@/features/territories/guest/view'
import { guestChange } from '@/features/territories/guest/writes'
import type { Territory } from '@/features/territories/types/territory'

const REPORTED: readonly GuestStatus[] = [
  'ready',
  'ended',
  'expired',
  'invalid',
  'paused',
]

export default function TerritoryGuestPage() {
  const theme = useTheme()
  const { session, state } = useGuestSession()
  const [renaming, setRenaming] = useState(false)
  const reported = useRef(false)
  const latest = useRef<GuestView | null>(null)
  const view =
    state.status === 'ready' && state.keys
      ? projectGuestView('guest', state.keys, state.records, state.next)
      : null

  useEffect(() => {
    latest.current = view
  })

  useEffect(() => {
    if (reported.current || !REPORTED.includes(state.status)) return
    reported.current = true
    analytics.capture('territory_guest_page_opened', { state: state.status })
  }, [state.status])

  useEffect(() => {
    if (state.refused === 0 || !session) return
    toast.error(i18n.t('territories.guest.refused', { count: state.refused }))
    session.clearRefused()
  }, [state.refused, session])

  if (!session || !view || !state.keys)
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <GuestStatusView
          status={state.status === 'ready' ? 'loading' : state.status}
          lost={state.lost}
          onRetry={
            session && (state.status === 'paused' || state.status === 'offline')
              ? () => void session.sync()
              : undefined
          }
        />
      </View>
    )

  const guest = renaming ? null : state.guest

  const onChange = (apply: (current: Territory) => Territory) => {
    const current = latest.current ?? view
    if (!state.guest) return
    const change = guestChange(
      current.territory,
      apply(current.territory),
      current,
      state.guest
    )
    session.write(change.writes)
    change.next.forEach(({ streetId, next }) => session.setNext(streetId, next))
    if (change.recorded && session.markFirstRecord())
      analytics.capture('territory_guest_first_record')
  }

  const onJoin = (name: string) => {
    if (!state.guest) analytics.capture('territory_guest_named')
    session.setName(name)
    setRenaming(false)
  }

  const forget = () =>
    confirmDestructive({
      title: i18n.t('territories.guest.forget_title'),
      description: i18n.t('territories.guest.forget_description'),
      confirmLabel: i18n.t('territories.guest.forget'),
      onConfirm: () => session.forget(),
    })

  const notices = [
    state.offline && (
      <GuestNotice
        key='offline'
        testID='guest-offline'
        offline
        text={
          state.queued > 0
            ? i18n.t('territories.guest.offlineQueued', {
                count: state.queued,
              })
            : i18n.t('territories.guest.offlineNothing')
        }
      />
    ),
    !view.houseRecords && (
      <GuestNotice
        key='privacy'
        testID='guest-privacy'
        text={i18n.t('territories.guest.privacy')}
      />
    ),
    view.streets.length === 0 && (
      <GuestNotice
        key='none'
        testID='guest-no-streets'
        text={i18n.t('territories.guest.noStreets')}
      />
    ),
  ].filter(Boolean)

  return (
    <View
      testID='guest-page'
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <GuestPageBody
        territory={view.territory}
        streets={view.streets}
        title={view.title}
        ownerName={view.from}
        endsText={i18n.t('territories.share.endsAt', {
          time: formatDateTime(session.expiresAt() ?? view.expiresAt, {
            style: 'medium',
          }),
        })}
        live
        guest={guest}
        houseRecords={view.houseRecords}
        initialName={state.guest?.name}
        notice={
          notices.length > 0 ? <View style={{ gap: 12 }}>{notices}</View> : null
        }
        footer={
          <GuestPageFooter
            name={guest?.name ?? null}
            onChangeName={() => setRenaming(true)}
            onForget={forget}
          />
        }
        onJoin={onJoin}
        onChange={onChange}
      />
    </View>
  )
}
