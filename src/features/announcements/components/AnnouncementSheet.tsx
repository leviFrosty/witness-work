import { Linking, View } from 'react-native'
import { Sheet } from 'tamagui'
import { X } from 'lucide-react-native'
import { Image } from 'expo-image'
import { GlassView } from 'expo-glass-effect'
import { EnrichedMarkdownText } from 'react-native-enriched-markdown'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useGlassColorScheme from '@/hooks/useGlassColorScheme'
import i18n from '@/lib/locales'
import apis from '@/constants/apis'
import { usePreferences } from '@/stores/preferences'
import {
  safeAnnouncementLink,
  resolveAnnouncementImages,
  type Announcement,
} from '@/features/announcements/lib/announcement'

export default function AnnouncementSheet({
  announcement,
  content,
  onClose,
}: {
  announcement: Announcement
  content: Announcement['locales'][string]
  onClose: () => void
}) {
  const theme = useTheme()
  const glassColorScheme = useGlassColorScheme()
  const insets = useSafeAreaInsets()
  const offset = usePreferences((state) => state.fontSizeOffset)
  const body = {
    fontFamily: theme.fonts.regular,
    fontSize: 16 + offset,
    color: theme.colors.text,
    lineHeight: 25 + offset,
  }
  // Published images are immutable paths within the same announcement service.
  // Resolve both inline and reference-style Markdown image destinations.
  const markdown = resolveAnnouncementImages(
    content.markdown,
    apis.announcements
  )

  return (
    <Sheet
      open
      modal
      onOpenChange={(value: boolean) => {
        if (!value) onClose()
      }}
      dismissOnSnapToBottom
      transition='quick'
      snapPoints={[85]}
    >
      <Sheet.Overlay />
      <Sheet.Handle />
      <Sheet.Frame backgroundColor={theme.colors.background}>
        <GlassView
          glassEffectStyle='regular'
          colorScheme={glassColorScheme}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              padding: 20,
            }}
          >
            <Text
              accessibilityRole='header'
              style={{
                flex: 1,
                fontSize: theme.fontSize('2xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {content.title}
            </Text>
            <IconButton
              noTransform
              icon={X}
              size={20}
              accessibilityLabel={i18n.t('close')}
              onPress={onClose}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </View>
          <Sheet.ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: insets.bottom + 30,
            }}
          >
            <EnrichedMarkdownText
              markdown={markdown}
              flavor='github'
              md4cFlags={{ latexMath: false }}
              enableLinkPreview={false}
              enableTaskListItemToggle={false}
              selectionMenuConfig={{
                copyAsMarkdown: { enabled: false },
                copyImageUrl: { enabled: false },
              }}
              onLinkPress={({ url }) => {
                if (safeAnnouncementLink(url))
                  void Linking.openURL(url).catch(() => {})
              }}
              markdownStyle={{
                paragraph: body,
                h1: {
                  ...body,
                  fontFamily: theme.fonts.bold,
                  fontSize: 26 + offset,
                },
                h2: {
                  ...body,
                  fontFamily: theme.fonts.bold,
                  fontSize: 23 + offset,
                },
                h3: {
                  ...body,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: 20 + offset,
                },
                h4: { ...body, fontFamily: theme.fonts.semiBold },
                h5: { ...body, fontFamily: theme.fonts.semiBold },
                h6: { ...body, fontFamily: theme.fonts.semiBold },
                list: {
                  ...body,
                  bulletColor: theme.colors.text,
                  markerColor: theme.colors.text,
                  itemSpacing: 6,
                },
                blockquote: {
                  ...body,
                  borderColor: theme.colors.accent,
                  backgroundColor: theme.colors.card,
                },
                link: { color: theme.colors.accent, underline: true },
                strong: {
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                },
                code: {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.card,
                },
                codeBlock: { ...body, backgroundColor: theme.colors.card },
                image: { height: 220, resizeMode: 'contain', borderRadius: 12 },
                thematicBreak: { color: theme.colors.border },
                table: {
                  ...body,
                  headerBackgroundColor: theme.colors.card,
                  headerTextColor: theme.colors.text,
                  rowEvenBackgroundColor: theme.colors.background,
                  rowOddBackgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  headerFontFamily: theme.fonts.semiBold,
                },
              }}
            />
            {announcement.signature && (
              <View style={{ marginTop: 24, alignItems: 'flex-start', gap: 4 }}>
                <Image
                  source={require('@/assets/signature.png')}
                  style={{ width: 180, height: 64 }}
                  contentFit='contain'
                  tintColor={theme.colors.text}
                  accessible={false}
                />
                <Text
                  style={{ fontFamily: theme.fonts.semiBold, fontSize: 14 }}
                >
                  {i18n.t('founderNoteSignOff')}
                </Text>
              </View>
            )}
          </Sheet.ScrollView>
        </GlassView>
      </Sheet.Frame>
    </Sheet>
  )
}
