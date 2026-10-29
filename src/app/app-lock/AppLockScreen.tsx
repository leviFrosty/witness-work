import {
  Fingerprint as FingerprintIcon,
  Lock as LockIcon,
  ScanFace as ScanFaceIcon,
} from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import FoldPane from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { AppLockMethod, appLockUnlockLabel } from '@/lib/appLock'

type Props = {
  method: AppLockMethod
  onUnlock: () => void
}

const METHOD_ICONS = {
  faceId: ScanFaceIcon,
  touchId: FingerprintIcon,
  passcode: LockIcon,
  biometrics: FingerprintIcon,
}

/** Covers the whole app until the device owner unlocks it. */
export default function AppLockScreen({ method, onUnlock }: Props) {
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
        <ActionButton onPress={onUnlock}>
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
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
