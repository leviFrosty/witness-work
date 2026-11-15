import { useState } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  KeyRound as KeyRoundIcon,
  ScanQrCode as ScanQrCodeIcon,
  UserRoundKey as UserRoundKeyIcon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import usePasskeySignIn from '@/features/settings/hooks/usePasskeySignInAvailable'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

export default function SignInSection({
  onAccountChanged,
}: {
  onAccountChanged: () => void
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const passkeySignIn = usePasskeySignIn()
  const [entering, setEntering] = useState(false)

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle text={i18n.t('account_signInSection')} alignWithIcons />
      <Section>
        {passkeySignIn && (
          <InputRowButton
            leftIcon={UserRoundKeyIcon}
            label={i18n.t('passkeySignIn_title')}
            onPress={() =>
              navigation.navigate('Sign In With Passkey', { entry: 'settings' })
            }
          />
        )}
        <InputRowButton
          leftIcon={ScanQrCodeIcon}
          label={i18n.t('handoff_signIn')}
          onPress={() =>
            navigation.navigate('Sign In With QR Code', { entry: 'settings' })
          }
        />
        <InputRowButton
          leftIcon={KeyRoundIcon}
          label={i18n.t('account_useRecoveryKey')}
          onPress={() => setEntering(true)}
          lastInSection
        />
      </Section>
      <SectionFooter text={i18n.t('account_signInFooter')} />
      <UseRecoveryKeySheet
        open={entering}
        onClose={() => setEntering(false)}
        onDone={onAccountChanged}
      />
    </View>
  )
}
