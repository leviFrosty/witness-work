import { useState } from 'react'
import { View } from 'react-native'
import {
  CircleCheck as CircleCheckIcon,
  Fingerprint as FingerprintIcon,
} from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import SignInButton from '@/app/web-sign-in/components/SignInButton'
import SignInPage from '@/app/web-sign-in/components/SignInPage'

/**
 * "Approved by …" after a phone signed this browser in, with That Wasn't Me,
 * which signs out and erases the browser, and Add a Passkey, so next time the
 * phone isn't needed.
 */
export default function ApprovedBy({
  deviceName,
  onContinue,
  onThatWasntMe,
  onAddPasskey,
}: {
  deviceName: string
  onContinue: () => void
  onThatWasntMe: () => Promise<void>
  /** Resolves true once a passkey was added. */
  onAddPasskey: () => Promise<boolean>
}) {
  const theme = useTheme()
  const [erasing, setErasing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  return (
    <SignInPage
      title={i18n.t('webSignIn_approvedTitle', { device: deviceName })}
      icon={<CircleCheckIcon size={36} color={theme.colors.accent} />}
    >
      <Text
        style={{
          textAlign: 'center',
          fontSize: theme.fontSize('md'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('webSignIn_approvedBody')}
      </Text>
      {!added && (
        <View style={{ gap: 8 }}>
          <SignInButton
            icon={FingerprintIcon}
            label={i18n.t('webSignIn_addPasskey')}
            loading={adding}
            disabled={erasing}
            onPress={() => {
              setAdding(true)
              void onAddPasskey()
                .then(setAdded)
                .finally(() => setAdding(false))
            }}
            testID='web-sign-in-add-passkey'
          />
          <Text
            style={{
              textAlign: 'center',
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('webSignIn_addPasskeyHint')}
          </Text>
        </View>
      )}
      <View style={{ gap: 12 }}>
        <SignInButton
          kind='primary'
          label={i18n.t('continue')}
          onPress={onContinue}
          disabled={erasing || adding}
          testID='web-sign-in-continue'
        />
        <SignInButton
          kind='text'
          destructive
          label={i18n.t('webSignIn_thatWasntMe')}
          loading={erasing}
          onPress={() => {
            setErasing(true)
            void onThatWasntMe().finally(() => setErasing(false))
          }}
          testID='web-sign-in-that-wasnt-me'
        />
      </View>
      <Text
        style={{
          textAlign: 'center',
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('webSignIn_approvedWarning')}
      </Text>
    </SignInPage>
  )
}
