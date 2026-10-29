import { Download as DownloadIcon } from 'lucide-react-native'
import { Platform, StyleSheet, View } from 'react-native'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import FoldPane from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { UpdateRequired } from '@/lib/appUpdate'

type Props = {
  required: UpdateRequired
  onUpdate: () => void
}

/** Covers the whole app until this version is updated. */
export default function UpdateRequiredScreen({ required, onUpdate }: Props) {
  const theme = useTheme()
  const { currentVersion, minVersion } = required

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      accessibilityViewIsModal
    >
      <FoldPane contentStyle={styles.content}>
        <View
          style={[styles.iconCircle, { backgroundColor: theme.colors.card }]}
        >
          <DownloadIcon size={36} color={theme.colors.accent} />
        </View>
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
          }}
        >
          {i18n.t('updateRequired_title')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            color: theme.colors.textAlt,
            textAlign: 'center',
          }}
        >
          {i18n.t(
            Platform.OS === 'android'
              ? 'updateRequired_bodyAndroid'
              : 'updateRequired_body'
          )}
        </Text>
        {currentVersion && minVersion && (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              textAlign: 'center',
            }}
          >
            {i18n.t('updateRequired_version', {
              current: currentVersion,
              min: minVersion,
            })}
          </Text>
        )}
        <ActionButton onPress={onUpdate}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('updateRequired_action')}
          </Text>
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
})
