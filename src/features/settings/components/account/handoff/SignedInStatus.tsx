import { CircleCheckBig as CircleCheckIcon } from 'lucide-react-native'
import {
  recordsCameBack,
  type RestoreOutcome,
} from '@/app/account/backupRestore'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'

const detailKey = (
  restore: RestoreOutcome,
  rejoined: boolean,
  via: 'handoff' | 'passkey'
) => {
  if (rejoined) return 'handoff_newDoneRejoined'
  switch (restore.outcome) {
    case 'restored':
      return 'handoff_newDoneRestored'
    case 'synced':
      return restore.combine
        ? 'handoff_newDoneSyncedCombine'
        : 'handoff_newDoneSynced'
    case 'none':
      // A passkey's new phone may have no other phone to turn Backup on.
      return via === 'passkey'
        ? 'passkeySignIn_doneData'
        : 'handoff_newDoneData'
    default:
      return 'handoff_newDoneRestoreLater'
  }
}

/**
 * "Signed in" on the new phone, after the other phone's QR code or a passkey:
 * what came over, and Continue (onboarding) or Done. When the account's records
 * came back (its backup, or Cloud Sync), onboarding ends there, as a backup
 * file's restore ends it. `rejoined`: back on the account this phone was on
 * (its key changed), whose records stay as they are.
 */
export default function SignedInStatus({
  restore,
  rejoined = false,
  via = 'handoff',
  onboarding,
  onDone,
}: {
  restore: RestoreOutcome
  rejoined?: boolean
  /** How the key came: another phone's QR code, or a passkey. */
  via?: 'handoff' | 'passkey'
  onboarding: boolean
  onDone: () => void
}) {
  // The account's buddies, once Buddies started here and synced them.
  const hasBuddies = useBuddies((state) => state.buddies.length > 0)
  return (
    <HandoffStatus
      icon={CircleCheckIcon}
      tone='success'
      title={i18n.t('handoff_newDoneTitle')}
      body={i18n.t(
        hasBuddies ? 'handoff_newDoneBody' : 'handoff_newDoneBodyNoBuddies'
      )}
      detail={i18n.t(detailKey(restore, rejoined, via))}
      primary={{
        label: i18n.t(onboarding ? 'continue' : 'done'),
        onPress: () => {
          // A link opened from the welcome screen arrives as `link`, still
          // during onboarding.
          if (
            recordsCameBack(restore) &&
            !usePreferences.getState().onboardingComplete
          )
            completeOnboardingFromRestore('account_backup')
          onDone()
        },
        testID: 'handoff-done',
      }}
      testID='handoff-new-done'
    />
  )
}
