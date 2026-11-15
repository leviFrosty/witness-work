import i18n from '@/lib/locales'
import BuddiesPausedNotice from '@/features/buddies/components/BuddiesPausedNotice'
import BuddiesPlansSharingSection from '@/features/buddies/components/BuddiesPlansSharingSection'
import BuddiesSharingSection from '@/features/buddies/components/BuddiesSharingSection'
import BuddySettingsScreenFrame from '@/features/buddies/components/BuddySettingsScreenFrame'

export default function BuddiesSharingScreen() {
  return (
    <BuddySettingsScreenFrame title={i18n.t('buddies_sharingTitle')}>
      {(buddy) => (
        <>
          {buddy && <BuddiesPausedNotice />}
          <BuddiesSharingSection />
          <BuddiesPlansSharingSection />
        </>
      )}
    </BuddySettingsScreenFrame>
  )
}
