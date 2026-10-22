import { ScrollView, View } from 'react-native'
import { WifiOff as WifiOffIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useUnbrokenWords from '@/hooks/useUnbrokenWords'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import ScribeSheetFrame from '@/features/scribe/components/ScribeSheetFrame'

/**
 * What tapping Scribe AI shows offline: why it can't work now, and the way to
 * add time by hand.
 */
const ScribeOfflineSheet = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { showsTimeEntry } = usePublisher()
  const titleFit = useUnbrokenWords(i18n.t('scribe_offlineTitle'))
  const bodyFit = useUnbrokenWords(i18n.t('scribe_offlineBody'))
  const close = () => navigation.goBack()

  return (
    <ScribeSheetFrame onDismissRequest={close}>
      {/* Fits its content, and scrolls once large text makes that taller than
          the window. */}
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingBottom: 8,
          gap: 18,
        }}
      >
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 6 }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: theme.colors.warnTranslucent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIcon
              icon={WifiOffIcon}
              size={28}
              color={theme.colors.warnText}
            />
          </View>
          <Text
            accessibilityRole='header'
            onTextLayout={titleFit.onTextLayout}
            style={{
              fontSize: theme.fontSize('xl') * titleFit.scale,
              fontFamily: theme.fonts.bold,
              textAlign: 'center',
            }}
          >
            {i18n.t('scribe_offlineTitle')}
          </Text>
          <Text
            onTextLayout={bodyFit.onTextLayout}
            style={{
              fontSize: (theme.fontSize('md') + 1) * bodyFit.scale,
              color: theme.colors.textAlt,
              textAlign: 'center',
              lineHeight: 22 * bodyFit.scale,
            }}
          >
            {i18n.t('scribe_offlineBody')}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Button
            noTransform
            onPress={close}
            style={{
              minHeight: 52,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textInverse,
              }}
            >
              {i18n.t('ok')}
            </Text>
          </Button>
          {showsTimeEntry && (
            <Button
              noTransform
              onPress={() => navigation.replace('Add Time')}
              style={{
                minHeight: 48,
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('md') + 1,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.accent,
                }}
              >
                {i18n.t('scribe_offlineAddTime')}
              </Text>
            </Button>
          )}
        </View>
      </ScrollView>
    </ScribeSheetFrame>
  )
}

export default ScribeOfflineSheet
