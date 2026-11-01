import i18n from '@/lib/locales'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import { ScopedSwitchRow } from '@/features/buddies/components/ScopedSettingRows'
import { useScopedSetting } from '@/features/buddies/hooks/useBuddySettingsScope'

export default function BuddiesCalendarSettingsSection() {
  const showOnCalendar = useScopedSetting('showOnCalendar')
  return (
    <BuddiesSection title={i18n.t('buddies_calendarSettingsTitle')}>
      <ScopedSwitchRow
        setting={showOnCalendar}
        label={i18n.t('buddies_showOnCalendar')}
        info={i18n.t('buddies_showOnCalendarInfo')}
        lastInSection
      />
    </BuddiesSection>
  )
}
