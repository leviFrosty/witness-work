import { AppWindow } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import FoldPane from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type Props = { onUseHere: () => void }

/** Web: the whole page while WitnessWork is open in another tab. */
export default function OpenInAnotherTabScreen({ onUseHere }: Props) {
  const theme = useTheme()

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FoldPane contentStyle={styles.content}>
        <View
          style={[styles.iconCircle, { backgroundColor: theme.colors.card }]}
        >
          <AppWindow size={36} color={theme.colors.accent} />
        </View>
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
          }}
        >
          {i18n.t('webTab_inUse')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            color: theme.colors.textAlt,
            textAlign: 'center',
            maxWidth: 420,
          }}
        >
          {i18n.t('webTab_inUseMessage')}
        </Text>
        <ActionButton onPress={onUseHere}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              // With the button's padding, a 48 pt target in every browser.
              lineHeight: 24,
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('webTab_useHere')}
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
