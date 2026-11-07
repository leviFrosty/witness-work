import {
  Fingerprint as FingerprintIcon,
  Lock as LockIcon,
  ScanFace as ScanFaceIcon,
  UserRoundKey as UserRoundKeyIcon,
} from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import FoldPane from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { AppLockMethod, appLockUnlockLabel } from '@/lib/appLock'

type Props = {
  method: AppLockMethod
  onUnlock: () => void

  unlocking?: boolean

  onSignOut?: () => void

  canUnlock?: boolean

  problem?: string | null
}

const METHOD_ICONS = {
  faceId: ScanFaceIcon,
  touchId: FingerprintIcon,
  passcode: LockIcon,
  biometrics: FingerprintIcon,
  passkey: UserRoundKeyIcon,
}

export default function AppLockScreen({
  method,
  onUnlock,
  unlocking,
  onSignOut,
  canUnlock = true,
  problem,
}: Props) {
  const theme = useTheme()
  const Icon = METHOD_ICONS[method]

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      accessibilityViewIsModal
    >
      <FoldPane contentStyle={styles.content}>
        <View
          style={[styles.iconCircle, { backgroundColor: theme.colors.card }]}
        >
          <LockIcon size={36} color={theme.colors.accent} />
        </View>
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
          }}
        >
          {i18n.t('appLock_lockedTitle')}
        </Text>
        {canUnlock && (
          <ActionButton
            onPress={onUnlock}
            loading={unlocking}
            testID='app-lock-unlock'
          >
            <View style={styles.buttonContent}>
              <Icon size={20} color={theme.colors.textInverse} />
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {appLockUnlockLabel(method)}
              </Text>
            </View>
          </ActionButton>
        )}
        {problem ? (
          <Text
            accessibilityRole='alert'
            accessibilityLiveRegion='polite'
            testID='app-lock-problem'
            style={{
              color: theme.colors.error,
              fontSize: theme.fontSize('sm'),
              textAlign: 'center',
              maxWidth: 360,
            }}
          >
            {problem}
          </Text>
        ) : null}
        {onSignOut && (
          <View style={styles.signOut}>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                textAlign: 'center',
              }}
            >
              {i18n.t('webAppLock_signOutHint')}
            </Text>
            <Button
              onPress={onSignOut}
              style={styles.signOutButton}
              testID='app-lock-sign-out'
            >
              <Text
                style={{
                  color: theme.colors.error,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('webSignOut_button')}
              </Text>
            </Button>
          </View>
        )}
      </FoldPane>
    </View>
  )
}

const styles = StyleSheet.create({
  container: StyleSheet.absoluteFill,
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 30,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  signOutButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
