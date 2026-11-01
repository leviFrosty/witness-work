import { useState } from 'react'
import { Alert, View } from 'react-native'
import { KeyRound as KeyRoundIcon } from 'lucide-react-native'
import { LogInIcon } from '@/components/ui/DirectionalIcon'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import RecoveryKeySheet from '@/features/settings/components/account/RecoveryKeySheet'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import { accountKey } from '@/app/account/accountKey'
import { analytics } from '@/lib/analytics'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'

export default function RecoveryKeySection({
  onAccountChanged,
}: {
  onAccountChanged: () => void
}) {
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

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle
        text={i18n.t('account_recoveryKeySection')}
        info={i18n.t('account_recoveryKeyInfo')}
        alignWithIcons
      />
      <Section>
        <InputRowButton
          leftIcon={KeyRoundIcon}
          label={i18n.t('account_showRecoveryKey')}
          onPress={() => void show()}
          disabled={opening}
        />
        <InputRowButton
          leftIcon={LogInIcon}
          label={i18n.t('account_useRecoveryKey')}
          onPress={() => setEntering(true)}
          lastInSection
        />
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
