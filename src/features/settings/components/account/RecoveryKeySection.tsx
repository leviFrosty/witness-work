import { useState } from 'react'
import { Alert, Platform, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  KeyRound as KeyRoundIcon,
  RotateCcwKey as RotateCcwKeyIcon,
} from 'lucide-react-native'
import { LogInIcon } from '@/components/ui/DirectionalIcon'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import RecoveryKeySheet from '@/features/settings/components/account/RecoveryKeySheet'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import { accountKey } from '@/app/account/accountKey'
import { useKeyChangeStatus } from '@/app/account/keyChange/status'
import { useKeyChangedElsewhere } from '@/lib/accountKey/keyChangedElsewhere'
import { analytics } from '@/lib/analytics'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { confirmSensitiveStepUp } from '@/lib/confirmSensitive'
import { type SensitiveCheck, stopsQuietly } from '@/lib/sensitiveCheck'
import type { StepUpResult } from '@/lib/serverAccount/stepUp'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { RootStackNavigation } from '@/types/rootStack'

const isWeb = Platform.OS === 'web'

/**
 * `recovery_key_viewed`'s `auth`: the device's check, a phone with no screen
 * lock, or on the web a passkey step-up or the server's window after signing
 * in.
 */
const recoveryKeyAuth = (
  owner: SensitiveCheck,
  stepUp: StepUpResult | null
) => {
  if (owner !== 'confirmed') return 'none'
  if (!stepUp) return 'device'
  return stepUp.status === 'confirmed' && stepUp.via === 'session'
    ? 'session'
    : 'step_up'
}

/**
 * Show Recovery Key (after the shared check before sensitive actions: the
 * device's own authentication on phones, creating the account key if there's
 * none yet; a step-up on the web), Change Account Key, and, on phones, Use a
 * Recovery Key. A browser signs in with a recovery key on its sign-in screen
 * instead. Signed out after a key change elsewhere, or while this device's own
 * change is unfinished, only Use a Recovery Key.
 */
export default function RecoveryKeySection({
  onAccountChanged,
  canChangeKey,
}: {
  /** The account key was created or replaced: check the account again. */
  onAccountChanged: () => void
  /** The account is set up, and this device may use it. */
  canChangeKey: boolean
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const changing = useKeyChangeStatus((state) => state.stage !== null)
  const signedOut = useKeyChangedElsewhere((state) => state.signedOut !== null)
  const ownKey = !changing && !signedOut
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)
  const [entering, setEntering] = useState(false)
  const [opening, setOpening] = useState(false)

  const show = async () => {
    if (opening) return
    setOpening(true)
    try {
      const { check: owner, stepUp } = await confirmSensitiveStepUp(
        'recovery_key',
        i18n.t('account_unlockPrompt')
      )
      // The web's step-up sheet already explained offline and no passkey.
      if (stopsQuietly(owner)) return
      if (owner === 'failed') {
        Alert.alert(
          i18n.t('account_unlockFailedTitle'),
          i18n.t(
            isWeb ? 'account_unlockFailedBodyWeb' : 'account_unlockFailedBody'
          )
        )
        return
      }
      const hadKey = (await accountKey.peek()) !== null
      // A signed-in browser always has its key; it never makes one here.
      if (isWeb && !hadKey) throw new Error('No account key in this browser')
      const key = await accountKey.getOrCreate()
      setRecoveryKey(encodeRecoveryKey(key))
      setShowing(true)
      analytics.capture('recovery_key_viewed', {
        auth: recoveryKeyAuth(owner, stepUp),
        created: !hadKey,
      })
      if (!hadKey) onAccountChanged()
    } catch (error) {
      logger.warn('Showing the recovery key failed', error)
      Alert.alert(
        i18n.t('account_keyFailedTitle'),
        i18n.t('account_keyFailedBody')
      )
    } finally {
      setOpening(false)
    }
  }

  // A browser has nothing else here: it signs in from the sign-in screen.
  if (isWeb && !ownKey) return null

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle
        text={i18n.t('account_recoveryKeySection')}
        info={i18n.t(
          isWeb ? 'account_recoveryKeyInfoWeb' : 'account_recoveryKeyInfo'
        )}
        alignWithIcons
      />
      <Section>
        {ownKey && (
          <InputRowButton
            leftIcon={KeyRoundIcon}
            label={i18n.t('account_showRecoveryKey')}
            onPress={() => void show()}
            disabled={opening}
            lastInSection={isWeb && !canChangeKey}
          />
        )}
        {ownKey && canChangeKey && (
          <InputRowButton
            leftIcon={RotateCcwKeyIcon}
            label={i18n.t('accountKeyChange_row')}
            sublabel={i18n.t('accountKeyChange_rowSublabel')}
            onPress={() =>
              navigation.navigate('Change Account Key', { entry: 'settings' })
            }
            lastInSection={isWeb}
          />
        )}
        {!isWeb && (
          <InputRowButton
            leftIcon={LogInIcon}
            label={i18n.t('account_useRecoveryKey')}
            onPress={() => setEntering(true)}
            lastInSection
          />
        )}
      </Section>
      <SectionFooter text={i18n.t('account_recoveryKeyFooter')} />
      <RecoveryKeySheet
        open={showing}
        recoveryKey={recoveryKey}
        onClose={() => setShowing(false)}
        onClosed={() => setRecoveryKey(null)}
      />
      {!isWeb && (
        <UseRecoveryKeySheet
          open={entering}
          onClose={() => setEntering(false)}
          onDone={onAccountChanged}
        />
      )}
    </View>
  )
}
