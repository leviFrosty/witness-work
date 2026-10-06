import { useState } from 'react'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import BuddyColorPicker from '@/features/buddies/components/BuddyColorPicker'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * How this buddy shows up for this User: calendar, color, nickname, and alerts
 * for their requests to join.
 */
export default function BuddyCalendarSection({ buddy }: { buddy: Buddy }) {
  const [nickname, setNickname] = useState(buddy.nickname ?? '')
  const joinRequestAlerts = useBuddies(
    (state) =>
      state.notificationsEnabled &&
      state.joinRequestNotifications &&
      state.registeredInboxId !== null
  )
  const muted = useBuddies((state) =>
    state.mutedJoinRequests.includes(buddy.inboxId)
  )

  const saveNickname = () => {
    if (nickname.trim() === (buddy.nickname ?? '')) return
    // Saved at once; a failed roster write is retried by the next change.
    buddiesEngine
      .setNickname(buddy.inboxId, nickname)
      .catch((error) => logger.warn('[buddies] nickname', error))
    analytics.capture('buddy_customized', { setting: 'nickname' })
  }

  return (
    <Section>
      <InputRowSwitch
        label={i18n.t('buddies_showOnCalendar')}
        value={buddy.showOnCalendar}
        onValueChange={(value) =>
          buddiesEngine.setShowOnCalendar(buddy.inboxId, value)
        }
      />
      <TextInputRow
        label={i18n.t('buddies_nickname')}
        info={i18n.t('buddies_nicknameInfo')}
        textInputProps={{
          value: nickname,
          onChangeText: setNickname,
          onEndEditing: saveNickname,
          placeholder: buddy.name,
          maxLength: 60,
          autoCapitalize: 'words',
          autoCorrect: false,
          enterKeyHint: 'done',
        }}
      />
      <BuddyColorPicker buddy={buddy} />
      {joinRequestAlerts ? (
        <InputRowSwitch
          label={i18n.t('buddies_askToJoinAlerts')}
          info={i18n.t('buddies_buddyAskToJoinAlertsInfo', {
            name: buddyDisplayName(buddy),
          })}
          value={!muted}
          onValueChange={(alerts) => {
            analytics.capture('buddy_join_request_notifications_changed', {
              scope: 'buddy',
              enabled: alerts,
            })
            // The Buddies runtime re-registers this device's push templates.
            useBuddies.setState((state) => ({
              mutedJoinRequests: alerts
                ? state.mutedJoinRequests.filter((id) => id !== buddy.inboxId)
                : [...state.mutedJoinRequests, buddy.inboxId],
            }))
          }}
          lastInSection
        />
      ) : null}
    </Section>
  )
}
