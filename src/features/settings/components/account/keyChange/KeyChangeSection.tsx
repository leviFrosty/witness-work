import { Alert, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  RotateCcwKey as RotateCcwKeyIcon,
  ScanQrCode as ScanQrCodeIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import { keyChange } from '@/app/account/keyChange'
import { KeyChangeError } from '@/app/account/keyChange/engine'
import { useKeyChangeStatus } from '@/app/account/keyChange/status'
import { useKeyChangedElsewhere } from '@/lib/accountKey/keyChangedElsewhere'
import { analytics } from '@/lib/analytics'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { toast } from '@/stores/toasts'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * Settings → Account's note about the account key, when there's one to make: a
 * change this device left unfinished (Continue or Discard), one finishing in
 * the background, or this device signed out because the key changed on another
 * one, with the ways back in.
 */
export default function KeyChangeSection() {
  const navigation = useNavigation<RootStackNavigation>()
  const stage = useKeyChangeStatus((state) => state.stage)
  const signedOut = useKeyChangedElsewhere((state) => state.signedOut)

  if (signedOut && !stage)
    return (
      <View style={{ gap: 5 }} testID='key-changed-elsewhere'>
        <SectionTitle
          text={i18n.t('accountKeyChange_elsewhereTitle')}
          alignWithIcons
        />
        <Section>
          <InputRowButton
            leftIcon={ScanQrCodeIcon}
            label={i18n.t('handoff_signIn')}
            onPress={() =>
              navigation.navigate('Sign In With QR Code', { entry: 'settings' })
            }
            lastInSection
          />
        </Section>
        <SectionFooter
          text={[
            signedOut.changedAt
              ? i18n.t('accountKeyChange_elsewhereBody', {
                  date: formatDate(signedOut.changedAt),
                })
              : i18n.t('accountKeyChange_elsewhereBodyNoDate'),
            i18n.t('accountKeyChange_elsewhereHow'),
          ].join(' ')}
        />
      </View>
    )

  if (stage === 'pending' || stage === 'confirmed') {
    const discard = () =>
      Alert.alert(
        i18n.t('accountKeyChange_discardTitle'),
        i18n.t('accountKeyChange_discardBody'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('accountKeyChange_resumeDiscard'),
            style: 'destructive',
            onPress: () =>
              void keyChange
                .discard()
                .then(() =>
                  analytics.capture('account_key_change_discarded', { stage })
                )
                .catch((error: unknown) => {
                  if (
                    error instanceof KeyChangeError &&
                    error.reason === 'committed'
                  ) {
                    // It went through: it finishes like any committed change.
                    toast.info(i18n.t('accountKeyChange_discardCommitted'))
                    void keyChange.resume().catch(() => undefined)
                    return
                  }
                  logger.warn('[keyChange] discarding failed', error)
                  // Only a missing connection says to connect.
                  toast.error(
                    i18n.t(
                      error instanceof KeyChangeError &&
                        error.reason === 'unresolved'
                        ? 'accountKeyChange_discardOffline'
                        : 'accountKeyChange_discardServer'
                    )
                  )
                }),
          },
        ]
      )
    return (
      <View style={{ gap: 5 }} testID='key-change-unfinished'>
        <SectionTitle
          text={i18n.t('accountKeyChange_resumeTitle')}
          alignWithIcons
        />
        <Section>
          <InputRowButton
            leftIcon={RotateCcwKeyIcon}
            label={i18n.t('accountKeyChange_resumeContinue')}
            onPress={() =>
              navigation.navigate('Change Account Key', { entry: 'resume' })
            }
          />
          <InputRowButton
            leftIcon={Trash2Icon}
            label={i18n.t('accountKeyChange_resumeDiscard')}
            onPress={discard}
            lastInSection
          />
        </Section>
        <SectionFooter text={i18n.t('accountKeyChange_resumeBody')} />
      </View>
    )
  }

  if (stage)
    return (
      <View style={{ gap: 5 }} testID='key-change-finishing-section'>
        <SectionTitle
          text={i18n.t('accountKeyChange_finishing')}
          alignWithIcons
        />
        <Section>
          <InputRowButton
            leftIcon={RotateCcwKeyIcon}
            label={i18n.t('handoff_tryAgain')}
            onPress={() =>
              void keyChange.resume().catch((error: unknown) => {
                logger.warn('[keyChange] finishing failed', error)
                toast.error(i18n.t('accountKeyChange_problemServer'))
              })
            }
            lastInSection
          />
        </Section>
        <SectionFooter text={i18n.t('accountKeyChange_finishingSection')} />
      </View>
    )

  return null
}
