import AppVersionInfo from '@/features/updates/components/AppVersionInfo'
import {
  Bug as BugIcon,
  Hand as HandIcon,
  Search as SearchIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Image, View } from 'react-native'
import { Input, InputProps } from 'tamagui'
import Text from '@/components/ui/MyText'
import Accordion from '@/components/ui/Accordion'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import links from '@/constants/links'
import { email } from '@/constants/contactInformation'
import { openURL } from '@/lib/links'
import { FAQEntry } from '@/features/updates/constants/faqs'

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

export const FAQItem = ({ entry }: { entry: FAQEntry }) => {
  const theme = useTheme()
  const question = i18n.t(`faq_${entry.id}_q` as TranslationKey)
  const answer = i18n.t(`faq_${entry.id}_a` as TranslationKey)

  return (
    <Accordion
      style={{ flexShrink: 1 }}
      header={
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            flex: 1,
            paddingRight: 10,
          }}
        >
          {question}
        </Text>
      }
    >
      <View style={{ gap: 12 }}>
        <Text style={{ lineHeight: 22 }}>{answer}</Text>
        {entry.id === 'reportBug' && <ReportLinks />}
      </View>
    </Accordion>
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
