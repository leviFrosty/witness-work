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
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { RootStackNavigation } from '@/types/rootStack'

const isWeb = Platform.OS === 'web'

/**
 * Show Recovery Key (after the device's own authentication, creating the
 * account key if there's none yet), Change Account Key, and Use a Recovery Key.
 * Signed out after a key change elsewhere, or while this device's own change is
 * unfinished, only Use a Recovery Key. A browser shows only Change Account
 * Key.
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
      const owner = await confirmDeviceOwner(i18n.t('account_unlockPrompt'))
      if (owner === 'cancelled') return
      if (owner === 'failed') {
        Alert.alert(
          i18n.t('account_unlockFailedTitle'),
          i18n.t('account_unlockFailedBody')
        )
        return
      }
      const hadKey = (await accountKey.peek()) !== null
      const key = await accountKey.getOrCreate()
      setRecoveryKey(encodeRecoveryKey(key))
      setShowing(true)
      analytics.capture('recovery_key_viewed', {
        auth: owner === 'confirmed' ? 'device' : 'none',
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

  // A browser has only Change Account Key here, once it may.
  if (isWeb && !(ownKey && canChangeKey)) return null

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
        {/* A browser shows its recovery key behind a passkey check, and
            signs in with one from the sign-in screen (ADR 0038 §8). */}
        {ownKey && !isWeb && (
          <InputRowButton
            leftIcon={KeyRoundIcon}
            label={i18n.t('account_showRecoveryKey')}
            onPress={() => void show()}
            disabled={opening}
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
      <UseRecoveryKeySheet
        open={entering}
        onClose={() => setEntering(false)}
        onDone={onAccountChanged}
      />
    </View>
  )
}
