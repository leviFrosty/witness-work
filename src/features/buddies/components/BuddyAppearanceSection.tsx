import { useState } from 'react'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import BuddyColorPicker from '@/features/buddies/components/BuddyColorPicker'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import type { Buddy } from '@/features/buddies/lib/state'

/**
 * How this buddy shows up for this User: a nickname and a color. Right under
 * their card, so a change shows there as it's made.
 */
export default function BuddyAppearanceSection({ buddy }: { buddy: Buddy }) {
  const [nickname, setNickname] = useState(buddy.nickname ?? '')

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
    </Section>
  )
}
