import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Image, View, TextInput as RNTextInput, ScrollView } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import {
  faBug,
  faCircleQuestion,
  faHand,
  faMagnifyingGlass,
  faThumbtack,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { useNavigation } from '@react-navigation/native'

import Header from '@/components/layout/Header'
import Wrapper from '@/components/layout/Wrapper'
import Text from '@/components/MyText'
import Accordion from '@/components/Accordion'
import Card from '@/components/Card'
import IconButton from '@/components/IconButton'
import Button from '@/components/Button'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import links from '@/constants/links'
import { email } from '@/constants/contactInformation'
import { openURL } from '@/lib/links'
import {
  FAQS,
  FAQ_CATEGORIES,
  FAQEntry,
  FAQCategory,
} from '@/features/updates/constants/faqs'

const normalize = (s: string) => s.toLowerCase().trim()

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
        <IconButton icon={faBug} />
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
        <IconButton icon={faHand} />
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('featureRequest')}
        </Text>
      </Button>
    </View>
  )
}

const FAQItem = ({ entry }: { entry: FAQEntry }) => {
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

const FAQScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation()
  const scrollRef = useRef<ScrollView>(null)
  const [search, setSearch] = useState('')

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={i18n.t('helpCenter')}
          rightElement={
            <IconButton
              style={{ position: 'absolute', right: 0 }}
              icon={faCircleQuestion}
              size='xl'
              accessibilityLabel={i18n.t('faq_jumpToStillNeedHelp')}
              onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
            />
          }
        />
      ),
    })
  }, [navigation])

  const trimmed = normalize(search)
  const isSearching = trimmed.length > 0

  const matches = useMemo(() => {
    if (!isSearching) return FAQS
    return FAQS.filter((entry) => {
      const q = normalize(i18n.t(`faq_${entry.id}_q` as TranslationKey))
      const a = normalize(i18n.t(`faq_${entry.id}_a` as TranslationKey))
      return q.includes(trimmed) || a.includes(trimmed)
    })
  }, [trimmed, isSearching])

  const pinned = useMemo(() => FAQS.filter((entry) => entry.pinned), [])

  const grouped = useMemo(() => {
    const map = new Map<FAQCategory, FAQEntry[]>()
    for (const entry of matches) {
      if (!isSearching && entry.pinned) continue
      const list = map.get(entry.category) ?? []
      list.push(entry)
      map.set(entry.category, list)
    }
    return FAQ_CATEGORIES.map((category) => ({
      category,
      entries: map.get(category) ?? [],
    })).filter((group) => group.entries.length > 0)
  }, [matches, isSearching])

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        innerRef={(ref) => {
          scrollRef.current = ref as unknown as ScrollView
        }}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 160,
          gap: 25,
        }}
      >
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
              width: 64,
              height: 64,
              borderRadius: 16,
            }}
          />
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
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

        <View style={{ paddingHorizontal: 15 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              height: 40,
              borderRadius: theme.numbers.borderRadiusSm,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              size={theme.fontSize('xs')}
              style={{ color: theme.colors.textAlt }}
            />
            <RNTextInput
              value={search}
              onChangeText={setSearch}
              placeholder={i18n.t('faq_searchPlaceholder')}
              placeholderTextColor={theme.colors.textAlt}
              clearButtonMode='while-editing'
              returnKeyType='search'
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

        {!isSearching && pinned.length > 0 && (
          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 20,
              }}
            >
              <FontAwesomeIcon
                icon={faThumbtack}
                size={theme.fontSize('xs')}
                style={{ color: theme.colors.textAlt }}
              />
              <SectionTitle text={i18n.t('faq_pinnedHeader')} />
            </View>
            <View style={{ gap: 10, paddingHorizontal: 15 }}>
              {pinned.map((entry) => (
                <FAQItem key={entry.id} entry={entry} />
              ))}
            </View>
          </View>
        )}

        {grouped.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('faq_noResults')}
            </Text>
          </View>
        ) : isSearching ? (
          <View style={{ gap: 10, paddingHorizontal: 15 }}>
            {matches.map((entry) => (
              <FAQItem key={entry.id} entry={entry} />
            ))}
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            <SectionTitle text={i18n.t('faq_allHeader')} />
            {grouped.map(({ category, entries }) => (
              <View key={category} style={{ gap: 8 }}>
                <Text
                  style={{
                    paddingHorizontal: 20,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t(`faq_category_${category}` as TranslationKey)}
                </Text>
                <View style={{ gap: 10, paddingHorizontal: 15 }}>
                  {entries.map((entry) => (
                    <FAQItem key={entry.id} entry={entry} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

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
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default FAQScreen
