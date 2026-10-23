import AppVersionInfo from '@/features/updates/components/AppVersionInfo'
import {
  Bug as BugIcon,
  Hand as HandIcon,
  Search as SearchIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useState } from 'react'
import { Image, Platform, Share, View } from 'react-native'
import { Collapsible, Host, RNHostView } from '@expo/ui'
import * as Clipboard from 'expo-clipboard'
import { useToastController } from '@tamagui/toast'
import { Input, InputProps } from 'tamagui'
import Text from '@/components/ui/MyText'
import Card, { useCardStyle } from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import { errorTracking } from '@/lib/errorTracking'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import links from '@/constants/links'
import { email } from '@/constants/contactInformation'
import { openURL } from '@/lib/links'
import RichTextView from '@/components/richText/RichTextView'
import { useItalicFonts } from '@/components/richText/richTextFonts'
import { richTextHasMark } from '@/lib/richText/inspect'
import type { HelpEntry } from '@/features/updates/types/helpCenter'
import { alignInput, alignText } from '@/lib/direction'
import { postScriptName } from '@/lib/postScriptName'

const ReportLinks = () => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
      <Button
        onPress={() => openURL(links.bugReport)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        <IconButton icon={BugIcon} />
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('bugReport')}
        </Text>
      </Button>
      <Button
        onPress={() => openURL(links.featureRequest)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        <IconButton icon={HandIcon} />
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('featureRequest')}
        </Text>
      </Button>
    </View>
  )
}

// Compose's Collapsible pads its own header and content (16dp each side).
const CARD_PADDING = Platform.OS === 'android' ? 4 : 20
const CONTENT_INSET =
  2 + CARD_PADDING * 2 + (Platform.OS === 'android' ? 32 : 0)

export const FAQItem = ({ entry }: { entry: HelpEntry }) => {
  const theme = useTheme()
  const { question, plainText: answer } = entry
  const italicsReady = useItalicFonts(richTextHasMark(entry.doc, 'italic'))
  const toast = useToastController()
  const cardStyle = useCardStyle()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const [expanded, setExpanded] = useState(false)
  const [width, setWidth] = useState<number>()
  const contentWidth = width && width - CONTENT_INSET

  const copyAnswer = async () => {
    try {
      await Clipboard.setStringAsync(answer)
      toast.show(i18n.t('copied'), { native: true, duration: 2000 })
    } catch (error) {
      errorTracking.captureException(error)
    }
  }

  return (
    <View
      style={[cardStyle, { flexShrink: 1, padding: CARD_PADDING }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {/* Without ignoreSafeArea, SwiftUI insets cards laid out under the
      header or home indicator, shifting the label and clipping the answer. */}
      <Host
        matchContents={{ vertical: true }}
        colorScheme={colorScheme}
        seedColor={theme.colors.accent}
        ignoreSafeArea='all'
      >
        <Collapsible
          isOpen={expanded}
          onOpenChange={setExpanded}
          label={question}
          // SwiftUI's DisclosureGroup announces its own state; Compose's
          // header reads this one.
          stateDescription={i18n.t(
            expanded ? 'a11y_expanded' : 'a11y_collapsed'
          )}
          labelStyle={{
            // SwiftUI looks fonts up by PostScript name, not the expo-font
            // alias.
            fontFamily:
              Platform.OS === 'ios'
                ? postScriptName(theme.fonts.semiBold)
                : theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
            color: theme.colors.text,
            textAlign: alignText('start'),
          }}
        >
          {/* Straight into the Collapsible's host: a nested host would
          swallow the long press on Android. */}
          <ContextMenu
            hosted
            actions={[
              {
                id: 'copy_answer',
                title: i18n.t('copyAnswer'),
                systemImage: 'doc.on.doc',
                onPress: () => void copyAnswer(),
              },
              {
                id: 'share',
                title: i18n.t('shareEllipsis'),
                systemImage: 'square.and.arrow.up',
                onPress: () =>
                  void Share.share({
                    message: `${question}\n\n${answer}`,
                  }).catch(() => {}),
              },
              {
                id: 'share_link',
                title: i18n.t('faq_shareLink'),
                systemImage: 'link',
                onPress: () =>
                  void Share.share(
                    Platform.OS === 'ios'
                      ? { url: entry.url }
                      : { message: entry.url }
                  ).catch(() => {}),
              },
            ]}
          >
            {/* Hosted RN content sizes to itself, so give it the width left
            inside the card. */}
            <View
              style={{
                width: contentWidth,
                paddingTop: Platform.OS === 'ios' ? 12 : 0,
              }}
            >
              <RichTextView
                doc={entry.doc}
                style={{ lineHeight: 22 }}
                showImages={false}
                spans={{
                  italicsReady,
                  linkColor: theme.colors.accent,
                  onLinkPress: (href) => void openURL(href),
                }}
              />
            </View>
          </ContextMenu>
          {entry.id === 'reportBug' && (
            <RNHostView matchContents>
              <View style={{ width: contentWidth, paddingTop: 12 }}>
                <ReportLinks />
              </View>
            </RNHostView>
          )}
        </Collapsible>
      </Host>
    </View>
  )
}

export const FAQIntro = ({ compact = false }: { compact?: boolean }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 25,
        paddingTop: 5,
        paddingBottom: 5,
      }}
    >
      <Image
        source={require('@/assets/icon.png')}
        style={{
          width: compact ? 44 : 64,
          height: compact ? 44 : 64,
          borderRadius: 16,
        }}
      />
      <Text
        style={{
          fontFamily: theme.fonts.bold,
          fontSize: theme.fontSize(compact ? 'lg' : 'xl'),
          color: theme.colors.text,
          textAlign: 'center',
        }}
      >
        {i18n.t('helpCenter_intro_title')}
      </Text>
      <Text
        style={{
          color: theme.colors.textAlt,
          textAlign: 'center',
          lineHeight: 22,
        }}
      >
        {i18n.t('helpCenter_intro_blurb')}
      </Text>
    </View>
  )
}

export const FAQSearch = ({
  search,
  setSearch,
}: {
  search: string
  setSearch: (value: string) => void
}) => {
  const theme = useTheme()
  return (
    <View style={{ paddingHorizontal: 15 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          minHeight: 44,
          borderRadius: theme.numbers.borderRadiusMd,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        <LucideIcon
          icon={SearchIcon}
          size={theme.fontSize('xs')}
          style={{ color: theme.colors.textAlt }}
        />
        <Input
          unstyled
          value={search}
          onChangeText={setSearch}
          // The placeholder goes once there's text; screen readers keep this.
          accessibilityLabel={i18n.t('faq_searchPlaceholder')}
          placeholder={i18n.t('faq_searchPlaceholder')}
          placeholderTextColor={
            theme.colors.textAlt as InputProps['placeholderTextColor']
          }
          clearButtonMode='while-editing'
          enterKeyHint='search'
          autoCorrect={false}
          autoCapitalize='none'
          style={{
            flex: 1,
            color: theme.colors.text,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize('md'),
            // Explicit: an unaligned field follows the app bundle's language on
            // iOS, which can be Arabic while the app runs in English.
            textAlign: alignInput('start'),
          }}
        />
      </View>
    </View>
  )
}

export const FAQSupport = ({
  onCopyAccountId,
}: {
  onCopyAccountId: () => void
}) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 24 }}>
      <View style={{ paddingHorizontal: 15 }}>
        <Card>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
            }}
          >
            {i18n.t('faq_stillNeedHelp')}
          </Text>
          <Text style={{ color: theme.colors.textAlt, lineHeight: 22 }}>
            {i18n.t('faq_stillNeedHelp_description')}
          </Text>
          <ReportLinks />
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
              lineHeight: 18,
            }}
          >
            {i18n.t('faq_emailLevi')}{' '}
            <Text
              onPress={() => openURL(`mailto:${email}`)}
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.accent,
                textDecorationLine: 'underline',
              }}
            >
              {email}
            </Text>
          </Text>
        </Card>
      </View>

      <View style={{ paddingHorizontal: 15, paddingTop: 4, gap: 5 }}>
        <AppVersionInfo />
        <Button
          onPress={onCopyAccountId}
          style={{ alignSelf: 'center', paddingVertical: 10 }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('copyAccountId')}
          </Text>
        </Button>
      </View>
    </View>
  )
}
