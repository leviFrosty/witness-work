import type { PropsWithChildren, ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import IconButton from '@/components/ui/IconButton'
import { ChevronBackwardIcon } from '@/components/ui/DirectionalIcon'
import Text from '@/components/ui/MyText'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/**
 * One page of the web's sign-in: a centered column with its title, and Back
 * when it isn't the first.
 */
export default function SignInPage({
  title,
  icon,
  onBack,
  children,
}: PropsWithChildren<{
  title: string
  icon?: ReactNode
  onBack?: () => void
}>) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps='handled'
    >
      <ContentColumn style={styles.column}>
        <View style={styles.backRow}>
          {onBack && (
            <IconButton
              icon={ChevronBackwardIcon}
              size={28}
              onPress={onBack}
              accessibilityLabel={i18n.t('webSignIn_back')}
              frame
              testID='web-sign-in-back'
            />
          )}
        </View>
        {icon && (
          <View
            style={[styles.iconCircle, { backgroundColor: theme.colors.card }]}
          >
            {icon}
          </View>
        )}
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('2xl'),
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        {children}
      </ContentColumn>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  column: { maxWidth: 440, gap: 20 },
  backRow: { height: 44, flexDirection: 'row' },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
})
