import {
  MessageCircle as MessageCircleIcon,
  Search as SearchIcon,
} from 'lucide-react-native'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { View, ScrollView, useWindowDimensions } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import Header from '@/components/ui/layout/Header'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import Empty from '@/components/ui/Empty'
import Spinner from '@/components/ui/Spinner'
import LucideIcon from '@/components/ui/LucideIcon'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  FAQIntro,
  FAQSearch,
  FAQItem,
  FAQSupport,
  FAQ_TEXT_INSET,
} from '@/features/updates/components/FAQContent'
import FAQTopics, {
  FAQTopic,
  faqTopicTitle,
} from '@/features/updates/components/FAQTopics'
import { RootStackParamList } from '@/types/rootStack'
import useFAQSearch from '@/features/updates/hooks/useFAQSearch'
import useHelpCenter from '@/features/updates/hooks/useHelpCenter'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import {
  BriefHighlightOverlay,
  useBriefHighlight,
} from '@/components/ui/BriefHighlight'

const LAYOUT_SETTLE_MS = 150
const HIGHLIGHT_DELAY_MS = 400

const FAQScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width, fontScale } = useWindowDimensions()
  const isWide = width >= 1000 && fontScale <= 1.3
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RootStackParamList, 'FAQ'>>()
  const requestedCategory = route.params?.scrollToCategory
  const { entries: faqs, categories, locale } = useHelpCenter()
  const targetCategory = categories.some(
    (category) => category.id === requestedCategory
  )
    ? requestedCategory
    : undefined
  const [selectedTopic, setSelectedTopic] = useState<FAQTopic>(
    targetCategory ?? 'pinned'
  )
  const [search, setSearch] = useState('')
  const { matches, isSearching, isWaitingForRemote } = useFAQSearch(
    search,
    faqs,
    locale
  )
  const scrollRef = useRef<ScrollView>(null)
  const answersRef = useRef<ScrollView>(null)
  const categoryOffsets = useRef<Partial<Record<string, number>>>({})

  const userScrolledRef = useRef(false)

  const placedYRef = useRef<number | null>(null)

  const [buildRest, setBuildRest] = useState(!targetCategory)

  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placeTargetCategory = () => {
    if (isWide || userScrolledRef.current || !targetCategory) return
    const y = categoryOffsets.current[targetCategory]
    if (y === undefined || y === placedYRef.current || !scrollRef.current)
      return
    placedYRef.current = y
    scrollRef.current.scrollTo({ y: Math.max(0, y + 8), animated: true })
    setBuildRest(true)
  }

  const scrollToTargetCategory = () => {
    if (placeTimer.current) clearTimeout(placeTimer.current)
    placeTimer.current = setTimeout(() => {
      placeTimer.current = null
      placeTargetCategory()
    }, LAYOUT_SETTLE_MS)
  }

  useEffect(
    () => () => {
      if (placeTimer.current) clearTimeout(placeTimer.current)
    },
    []
  )

  useEffect(() => {
    if (targetCategory) {
      setSelectedTopic(targetCategory)
      setSearch('')
    }
  }, [targetCategory])

  const { progress: highlight, play: playHighlight } = useBriefHighlight()
  useEffect(() => {
    if (!targetCategory) return
    const timer = setTimeout(playHighlight, HIGHLIGHT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [targetCategory, playHighlight])

  useEffect(() => {
    userScrolledRef.current = false
    placedYRef.current = null
    if (isWide || !targetCategory) return

    const frame = requestAnimationFrame(() => {
      const y = categoryOffsets.current[targetCategory]
      if (y === undefined || placedYRef.current !== null || !scrollRef.current)
        return
      placedYRef.current = y
      scrollRef.current.scrollTo({ y: Math.max(0, y + 8), animated: true })
      setBuildRest(true)
    })

    const fallback = setTimeout(() => setBuildRest(true), 1000)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(fallback)
    }
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
                } else {
                  userScrolledRef.current = true
                  scrollToEndPending.current = true
                  setBuiltSections(Infinity)
                  scrollRef.current?.scrollToEnd({ animated: true })
                }
              }}
            />
          }
        />
      ),
    })
  }, [navigation, isWide])

  const pinned = faqs.filter((entry) => entry.pinned)
  const visibleAnswers = isSearching
    ? matches
    : selectedTopic === 'all'
      ? faqs
      : selectedTopic === 'pinned'
        ? pinned
        : faqs.filter((entry) => entry.category === selectedTopic)
  const grouped = categories
    .map(({ id: category, title }) => ({
      category,
      title,
      entries: faqs.filter(
        (entry) =>
          entry.category === category &&
          (!entry.pinned || category === targetCategory)
      ),
    }))
    .filter((group) => group.entries.length > 0)

  const targetSections =
    grouped.findIndex((group) => group.category === targetCategory) + 1
  const [builtSections, setBuiltSections] = useState(1)
  const allBuilt = builtSections >= grouped.length
  const paused = builtSections >= targetSections && !buildRest
  useEffect(() => {
    if (isWide || allBuilt || paused) return
    const frame = requestAnimationFrame(() =>
      setBuiltSections((built) => built + 1)
    )
    return () => cancelAnimationFrame(frame)
  }, [isWide, allBuilt, paused, builtSections])

  const scrollToEndPending = useRef(false)

  const support = <FAQSupport />
  const results = (
    <View style={{ gap: 10, paddingHorizontal: 15 }}>
      {(isWide ? visibleAnswers : matches).map((entry) => (
        <FAQItem key={entry.id} entry={entry} />
      ))}
      {matches.length === 0 && isWaitingForRemote && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 24,
          }}
        >
          <Spinner size='small' />
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('faq_searching')}
          </Text>
        </View>
      )}
      {matches.length === 0 && !isWaitingForRemote && (
        <Empty
          icon={
            <LucideIcon icon={SearchIcon} size={24} color={theme.colors.text} />
          }
          title={i18n.t('contacts_emptySearch_title')}
          description={i18n.t('faq_noResults')}
        />
      )}
    </View>
  )

  const foldColumn = useFoldColumn(720)
  return (
    <Wrapper insets='none' style={{ flex: 1 }}>
      {isWide ? (
        <FoldSplit
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 1100,
            alignSelf: 'center',
            paddingTop: 20,
            paddingBottom: insets.bottom + 16,
          }}
          paddingHorizontal={20}
          gap={24}
          leadingWidth={280}
          leading={
            <View
              style={{
                flex: 1,
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
                  categories={categories}
                  selected={isSearching ? undefined : selectedTopic}
                  onSelect={(topic) => {
                    setSelectedTopic(topic)
                    setSearch('')
                  }}
                />
              </ScrollView>
            </View>
          }
          trailing={
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
                <View>
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
                      : faqTopicTitle(selectedTopic, categories)}
                  </Text>
                  {!isSearching && selectedTopic === targetCategory && (
                    <BriefHighlightOverlay
                      progress={highlight}
                      borderRadius={theme.numbers.borderRadiusSm}
                      style={{ top: -4, bottom: -4, left: 5, right: 5 }}
                    />
                  )}
                </View>
                {!isSearching && selectedTopic === 'support'
                  ? support
                  : results}
              </View>
            </ScrollView>
          }
        />
      ) : (
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          innerRef={(ref) => {
            scrollRef.current = ref as unknown as ScrollView
          }}
          keyboardShouldPersistTaps='handled'
          onContentSizeChange={() => {
            if (scrollToEndPending.current) {
              if (allBuilt) scrollToEndPending.current = false
              scrollRef.current?.scrollToEnd({ animated: true })
              return
            }
            scrollToTargetCategory()
          }}
          onScrollBeginDrag={() => {
            userScrolledRef.current = true
            setBuildRest(true)
          }}
          contentContainerStyle={{
            paddingTop: 20,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <View
            style={[
              {
                width: '100%',
                maxWidth: 720,
                alignSelf: 'center',
                gap: 25,
              },
              foldColumn,
            ]}
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
                        paddingHorizontal: FAQ_TEXT_INSET,
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
                    paddingHorizontal: 15 + FAQ_TEXT_INSET,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('faq_allHeader')}
                </Text>
                {grouped
                  .slice(0, builtSections)
                  .map(({ category, title, entries }) => (
                    <View
                      key={category}
                      style={{ gap: 10, paddingHorizontal: 15 }}
                      onLayout={(event) => {
                        categoryOffsets.current[category] =
                          event.nativeEvent.layout.y
                        if (category === targetCategory)
                          scrollToTargetCategory()
                      }}
                    >
                      <View>
                        <Text
                          accessibilityRole='header'
                          style={{
                            paddingHorizontal: FAQ_TEXT_INSET,
                            fontFamily: theme.fonts.semiBold,
                            color: theme.colors.textAlt,
                          }}
                        >
                          {title}
                        </Text>
                        {category === targetCategory && (
                          <BriefHighlightOverlay
                            progress={highlight}
                            borderRadius={theme.numbers.borderRadiusSm}
                            style={{ top: -6, bottom: -6 }}
                          />
                        )}
                      </View>
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
