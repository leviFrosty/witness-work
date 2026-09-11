import { MessageCircle as MessageCircleIcon } from 'lucide-react-native'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { View, ScrollView, useWindowDimensions } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as Sentry from '@sentry/react-native'
import Purchases from 'react-native-purchases'
import { useToastController } from '@tamagui/toast'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import Header from '@/components/ui/layout/Header'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import {
  FAQS,
  FAQ_CATEGORIES,
  FAQCategory,
} from '@/features/updates/constants/faqs'
import {
  FAQIntro,
  FAQSearch,
  FAQItem,
  FAQSupport,
} from '@/features/updates/components/FAQContent'
import FAQTopics, {
  FAQTopic,
  faqTopicTitle,
} from '@/features/updates/components/FAQTopics'
import { RootStackParamList } from '@/types/rootStack'

const FAQScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width, fontScale } = useWindowDimensions()
  const isWide = width >= 1000 && fontScale <= 1.3
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RootStackParamList, 'FAQ'>>()
  const requestedCategory = route.params?.scrollToCategory
  const targetCategory = FAQ_CATEGORIES.includes(
    requestedCategory as FAQCategory
  )
    ? (requestedCategory as FAQCategory)
    : undefined
  const [selectedTopic, setSelectedTopic] = useState<FAQTopic>(
    targetCategory ?? 'pinned'
  )
  const [search, setSearch] = useState('')
  const scrollRef = useRef<ScrollView>(null)
  const answersRef = useRef<ScrollView>(null)
  const categoryOffsets = useRef<Partial<Record<FAQCategory, number>>>({})
  const didScrollRef = useRef(false)
  const toast = useToastController()

  const handleCopyAccountId = useCallback(async () => {
    try {
      // Live SDK value, not `customer.originalAppUserId` — the dev reset flow
      // can swap the active user via `logIn`, and the current ID is what
      // matters for granting a promotional entitlement in the RC dashboard.
      const id = await Purchases.getAppUserID()
      await Clipboard.setStringAsync(id)
      toast.show(i18n.t('accountIdCopied'), { message: '', native: true })
    } catch (error) {
      Sentry.captureException(error)
      toast.show(i18n.t('copyAccountIdError'), { message: '', native: true })
    }
  }, [toast])

  const scrollToTargetCategory = () => {
    if (isWide || didScrollRef.current || !targetCategory) return
    const y = categoryOffsets.current[targetCategory]
    if (y === undefined || !scrollRef.current) return
    didScrollRef.current = true
    scrollRef.current.scrollTo({ y: Math.max(0, y + 8), animated: true })
  }

  useEffect(() => {
    if (targetCategory) {
      setSelectedTopic(targetCategory)
      setSearch('')
    }
  }, [targetCategory])

  useEffect(() => {
    didScrollRef.current = false
    if (isWide || !targetCategory) return
    // A new route target can have unchanged geometry, so native onLayout and
    // content-size callbacks may not run. Try cached offsets after commit;
    // those callbacks still handle first mount and subsequent measurement.
    const frame = requestAnimationFrame(() => {
      const y = categoryOffsets.current[targetCategory]
      if (didScrollRef.current || y === undefined || !scrollRef.current) return
      didScrollRef.current = true
      scrollRef.current.scrollTo({ y: Math.max(0, y + 8), animated: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [targetCategory, isWide])

  useEffect(() => {
    if (!isWide) return
    answersRef.current?.scrollTo({ y: 0, animated: false })
  }, [isWide, selectedTopic, search])

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={i18n.t('helpCenter')}
          rightElement={
            <IconButton
              style={{ position: 'absolute', right: 0 }}
              icon={MessageCircleIcon}
              size='xl'
              accessibilityLabel={i18n.t('faq_jumpToStillNeedHelp')}
              onPress={() => {
                if (isWide) {
                  setSelectedTopic('support')
                  setSearch('')
                } else scrollRef.current?.scrollToEnd({ animated: true })
              }}
            />
          }
        />
      ),
    })
  }, [navigation, isWide])

  const query = search.toLocaleLowerCase().trim()
  const isSearching = query.length > 0
  const matches = FAQS.filter(
    (entry) =>
      !isSearching ||
      i18n
        .t(`faq_${entry.id}_q` as TranslationKey)
        .toLocaleLowerCase()
        .includes(query) ||
      i18n
        .t(`faq_${entry.id}_a` as TranslationKey)
        .toLocaleLowerCase()
        .includes(query)
  )
  const pinned = FAQS.filter((entry) => entry.pinned)
  const visibleAnswers = isSearching
    ? matches
    : selectedTopic === 'all'
      ? FAQS
      : selectedTopic === 'pinned'
        ? pinned
        : FAQS.filter((entry) => entry.category === selectedTopic)
  const grouped = FAQ_CATEGORIES.map((category) => ({
    category,
    entries: FAQS.filter(
      (entry) =>
        entry.category === category &&
        (!entry.pinned || category === targetCategory)
    ),
  })).filter((group) => group.entries.length > 0)

  const support = <FAQSupport onCopyAccountId={handleCopyAccountId} />
  const results = (
    <View style={{ gap: 10, paddingHorizontal: 15 }}>
      {(isWide ? visibleAnswers : matches).map((entry) => (
        <FAQItem key={entry.id} entry={entry} />
      ))}
      {matches.length === 0 && (
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('faq_noResults')}
        </Text>
      )}
    </View>
  )

  return (
    <Wrapper insets='none' style={{ flex: 1 }}>
      {isWide ? (
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            width: '100%',
            maxWidth: 1100,
            alignSelf: 'center',
            paddingTop: 20,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 20,
            gap: 24,
          }}
        >
          <View
            style={{
              width: 280,
              borderRadius: theme.numbers.borderRadiusLg,
              backgroundColor: theme.colors.backgroundLighter,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps='handled'
              contentContainerStyle={{ gap: 16, paddingVertical: 16 }}
            >
              <FAQIntro compact />
              <FAQSearch search={search} setSearch={setSearch} />
              <FAQTopics
                selected={isSearching ? undefined : selectedTopic}
                onSelect={(topic) => {
                  setSelectedTopic(topic)
                  setSearch('')
                }}
              />
            </ScrollView>
          </View>
          <ScrollView
            ref={answersRef}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 720,
                alignSelf: 'center',
                gap: 20,
              }}
            >
              <Text
                accessibilityRole='header'
                style={{
                  paddingHorizontal: 15,
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.bold,
                }}
              >
                {isSearching
                  ? i18n.t('faq_allHeader')
                  : faqTopicTitle(selectedTopic)}
              </Text>
              {!isSearching && selectedTopic === 'support' ? support : results}
            </View>
          </ScrollView>
        </View>
      ) : (
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          innerRef={(ref) => {
            scrollRef.current = ref as unknown as ScrollView
          }}
          keyboardShouldPersistTaps='handled'
          onContentSizeChange={scrollToTargetCategory}
          contentContainerStyle={{
            paddingTop: 20,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 720,
              alignSelf: 'center',
              gap: 25,
            }}
          >
            <FAQIntro />
            <FAQSearch search={search} setSearch={setSearch} />
            {isSearching ? (
              results
            ) : (
              <>
                {pinned.length > 0 && (
                  <View style={{ gap: 10, paddingHorizontal: 15 }}>
                    <Text
                      accessibilityRole='header'
                      style={{
                        paddingHorizontal: 20,
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.textAlt,
                      }}
                    >
                      {i18n.t('faq_pinnedHeader')}
                    </Text>
                    {pinned.map((entry) => (
                      <FAQItem key={entry.id} entry={entry} />
                    ))}
                  </View>
                )}
                <Text
                  accessibilityRole='header'
                  style={{
                    paddingHorizontal: 35,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('faq_allHeader')}
                </Text>
                {grouped.map(({ category, entries }) => (
                  <View
                    key={category}
                    style={{ gap: 10, paddingHorizontal: 15 }}
                    onLayout={(event) => {
                      categoryOffsets.current[category] =
                        event.nativeEvent.layout.y
                      if (category === targetCategory) scrollToTargetCategory()
                    }}
                  >
                    <Text
                      accessibilityRole='header'
                      style={{
                        paddingHorizontal: 20,
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.textAlt,
                      }}
                    >
                      {faqTopicTitle(category)}
                    </Text>
                    {entries.map((entry) => (
                      <FAQItem key={entry.id} entry={entry} />
                    ))}
                  </View>
                ))}
              </>
            )}
            {support}
          </View>
        </KeyboardAwareScrollView>
      )}
    </Wrapper>
  )
}

export default FAQScreen
