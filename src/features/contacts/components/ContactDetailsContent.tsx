import {
  Plus as PlusIcon,
  UserRoundX as UserRoundXIcon,
} from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { CommonActions } from '@react-navigation/native'
import { ScrollView, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { getLocales } from 'expo-localization'
import { StatusBar } from 'expo-status-bar'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import Header from '@/components/ui/layout/Header'
import Wrapper from '@/components/ui/layout/Wrapper'
import XView from '@/components/ui/layout/XView'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useDismissFollowUp from '@/hooks/useDismissFollowUp'
import { navigateTo } from '@/lib/address'
import { navigationRef } from '@/features/contacts/lib/linking'
import { getReadableTextColor, relativeLuminance } from '@/lib/color'
import {
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
} from '@/lib/conversations'
import { formatDate } from '@/lib/dates'
import { getNoteText } from '@/lib/richText/notes'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'
import ContactCustomFieldsCard from '@/features/contacts/components/ContactCustomFieldsCard'
import ContactDetailsActions, {
  type ContactDetailsNavigation,
} from '@/features/contacts/components/ContactDetailsActions'
import ContactHero from '@/features/contacts/components/ContactHero'
import ContactReachCard from '@/features/contacts/components/ContactReachCard'
import ContactVisitCard, {
  type ContactVisitPlan,
} from '@/features/contacts/components/ContactVisitCard'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import VisitHistorySummary from '@/features/contacts/components/VisitHistorySummary'
import VisitTimeline from '@/features/contacts/components/VisitTimeline'
import useContactHeroBackground, {
  actionForeground,
  useContactActionColor,
} from '@/features/contacts/hooks/useContactHeroBackground'
import { useHorizontalBleed } from '@/components/ui/layout/HorizontalSafeArea'
import WindowControlsInsetView, {
  NO_WINDOW_CONTROLS,
} from '../../../../modules/window-controls'
import {
  canNavigateTo,
  contactAddressLines,
} from '@/features/contacts/lib/contactChannels'
import {
  getJourney,
  getOpenFollowUp,
  getUpNext,
  JOURNEY_MIN_VISITS,
  sortVisitsNewestFirst,
} from '@/features/contacts/lib/visitTimeline'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

const CONTENT_MAX_WIDTH = 760

const VISIT_CARD_OVERLAP = 46

const NAME_SCROLLED_AWAY = 64

const LOG_BAR_BUTTON = MIN_TOUCH_TARGET
const LOG_BAR_PADDING = 10

const HISTORY_HEADING = 36
const HISTORY_TALLY = 30
const HISTORY_ROW = 66
const HISTORY_NOTE_ROW = 84
const LAST_NOTE_GAP = 6

type Props = {
  id: string
  highlightedVisitId?: string
  navigation: ContactDetailsNavigation
  embedded?: boolean

  scrollY?: number

  onScrollY?: (y: number) => void
}

const ContactDetailsContent = ({
  id,
  highlightedVisitId,
  navigation,
  embedded = false,
  scrollY,
  onScrollY,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const bleed = useHorizontalBleed()

  const foldColumn = useFoldColumn(CONTENT_MAX_WIDTH)

  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)
  const { developerTools, defaultNavigationMapProvider } = usePreferences()
  const { contacts, customFieldDefs } = useContacts()
  const { conversations } = useConversations()
  const contact = contacts.find((c) => c.id === id)
  const heroBackground = useContactHeroBackground(contact)
  const actionColor = useContactActionColor(contact)

  const heroForeground = getReadableTextColor(heroBackground)
  const heroIsDark = relativeLuminance(heroBackground) <= 0.45

  const contactVisits = sortVisitsNewestFirst(
    conversations.filter((visit) => visit.contact.id === id)
  )
  const lastTry = contactVisits.find((visit) => visit.notAtHome)
  const latestTried = lastTry ? new Date(lastTry.date) : undefined
  const upNext = getUpNext(contactVisits)
  const open = upNext ? null : getOpenFollowUp(contactVisits)
  const plan: ContactVisitPlan | null = upNext
    ? { ...upNext, status: 'upcoming' }
    : open
      ? {
          ...open,
          status: open.attempted ? 'attempted' : 'missed',
          triedAt: open.attempted ? latestTried : undefined,
        }
      : null
  const latestVisit = contactVisits.at(0)
  const lastConversationIndex = contactVisits.findIndex(
    (visit) => !visit.notAtHome
  )
  const lastConversation = contactVisits[lastConversationIndex]
  const lastNote =
    (lastConversation && getNoteText(lastConversation).trim()) || undefined
  const journey =
    contactVisits.length >= JOURNEY_MIN_VISITS
      ? getJourney(contactVisits, new Date())
      : null
  const [nameScrolledAway, setNameScrolledAway] = useState(false)
  const dismissFollowUp = useDismissFollowUp()
  const [heroHeight, setHeroHeight] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [historyY, setHistoryY] = useState(0)
  const [lastNoteShown, setLastNoteShown] = useState(false)
  const [lastNoteHeight, setLastNoteHeight] = useState(0)

  const lastNoteRowBottom =
    heroHeight +
    historyY -
    (lastNoteShown ? lastNoteHeight + LAST_NOTE_GAP : 0) +
    HISTORY_HEADING +
    (journey ? HISTORY_TALLY : 0) +
    Math.max(lastConversationIndex, 0) * HISTORY_ROW +
    HISTORY_NOTE_ROW
  const lastNoteBelowFold =
    !!lastNote &&
    viewportHeight > 0 &&
    historyY > 0 &&
    lastNoteRowBottom > viewportHeight

  useEffect(() => {
    setLastNoteShown(lastNoteBelowFold)
  }, [lastNoteBelowFold])
  const [visitCardBottom, setVisitCardBottom] = useState(0)
  const [visitCardScrolledAway, setVisitCardScrolledAway] = useState(false)
  const headerTitle = nameScrolledAway ? (contact?.name ?? '') : ''

  const scrollViewRef = useRef<ScrollView>(null)

  const scrolledToStart = useRef(!scrollY)
  const highlightedRowRef = useRef<View>(null)
  const hasHighlightedVisit = contactVisits.some(
    (visit) => visit.id === highlightedVisitId
  )

  useEffect(() => {
    if (!highlightedVisitId || !hasHighlightedVisit) return
    const timer = setTimeout(() => {
      const scrollView = scrollViewRef.current
      const row = highlightedRowRef.current
      if (!scrollView || !row) return
      row.measureLayout(
        scrollView as unknown as View,
        (_x, y) =>
          scrollView.scrollTo({ y: Math.max(0, y - 100), animated: true }),
        () => {}
      )
    }, 450)
    return () => clearTimeout(timer)
  }, [highlightedVisitId, hasHighlightedVisit])

  useEffect(() => {
    if (embedded) return
    navigation.setOptions({
      header: () => (
        <Header
          noBottomBorder
          title={headerTitle}
          buttonType='back'
          foregroundColor={heroForeground}
          backgroundColor={heroBackground}
          rightElement={
            contact ? (
              <View style={{ position: 'absolute', right: 0 }}>
                <ContactDetailsActions
                  contact={contact}
                  navigation={navigation}
                  embedded={false}
                  color={heroForeground}
                />
              </View>
            ) : undefined
          }
        />
      ),
    })
  }, [
    contact,
    embedded,
    navigation,
    heroForeground,
    heroBackground,
    headerTitle,
  ])

  if (!contact) {
    return (
      <Wrapper style={{ flexGrow: 1, padding: 10 }}>
        <Empty
          style={{ flex: 1 }}
          icon={
            <LucideIcon
              icon={UserRoundXIcon}
              size={24}
              color={theme.colors.text}
            />
          }
          title={i18n.t('contactNotFound_title')}
          description={i18n.t('contactNotFound_description')}
          action={
            <ActionButton
              onPress={() =>
                navigationRef.dispatch(
                  CommonActions.navigate({
                    name: 'Root',
                    pop: true,
                    params: { screen: 'Contacts' },
                  })
                )
              }
            >
              {i18n.t('contactNotFound_action')}
            </ActionButton>
          }
        />
      </Wrapper>
    )
  }

  const phone = contact.phone
    ? parsePhoneNumber(contact.phone, {
        regionCode: contact.phoneRegionCode || getLocales()[0].regionCode || '',
      })
    : null
  const rootNavigation = navigation as RootStackNavigation
  const call = phone
    ? () => handleCall(contact, phone, rootNavigation)
    : undefined
  const text = phone
    ? () => handleMessage(contact, phone, rootNavigation)
    : undefined
  const email = contact.email
    ? () =>
        openURL(`mailTo:${contact.email}`, {
          alert: { description: i18n.t('failedToOpenMailApplication') },
        })
    : undefined
  const navigate = canNavigateTo(contact)
    ? () => navigateTo(contact, defaultNavigationMapProvider)
    : undefined

  const hasInformation =
    contactAddressLines(contact).length > 0 ||
    !!contact.phone?.trim() ||
    !!contact.email?.trim() ||
    customFieldDefs.some(
      (def) => !def.archived && !!contact.customFields?.[def.id]?.trim()
    )

  const editContact = () =>
    navigation.navigate('Contact Form', {
      id: contact.id,
      edit: true,
      returnToContacts: true,
    })

  const logVisit = () =>
    navigation.navigate('Visit Form', {
      contactId: contact.id,
      returnToContacts: true,
      followUpVisitId: plan?.visit.id,
    })

  const planVisit = latestVisit
    ? () =>
        navigation.navigate('Visit Form', {
          contactId: contact.id,
          visitToEditId: latestVisit.id,
          notAtHome: latestVisit.notAtHome,
          planFollowUp: true,
          returnToContacts: true,
        })
    : undefined

  const isActiveStudy = contactStudiedForGivenMonth({
    contact,
    conversations,
    month: new Date(),
  })
  const mostRecentStudy = contactMostRecentStudy({ conversations, contact })

  const firstVisit = contactVisits.at(-1)
  const createdWithFirstVisit =
    !!firstVisit &&
    new Date(firstVisit.date).toDateString() ===
      new Date(contact.createdAt).toDateString()

  const logBarBottom = embedded
    ? LOG_BAR_PADDING
    : Math.max(insets.bottom, LOG_BAR_PADDING)

  const column = {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    ...foldColumn,
  } as const

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {embedded && (
        <WindowControlsInsetView
          onInsetsChange={setControls}
          style={{ backgroundColor: heroBackground }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: CONTENT_MAX_WIDTH,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 20,
              padding: 16,
              paddingEnd: 16 + controls.end,
            }}
          >
            <Text
              numberOfLines={1}
              accessibilityElementsHidden={!nameScrolledAway}
              importantForAccessibility={
                nameScrolledAway ? 'auto' : 'no-hide-descendants'
              }
              style={{
                flex: 1,
                fontSize: 18,
                fontFamily: theme.fonts.semiBold,
                color: heroForeground,
                opacity: nameScrolledAway ? 1 : 0,
              }}
            >
              {contact.name}
            </Text>
            <ContactDetailsActions
              contact={contact}
              navigation={navigation}
              embedded
              color={heroForeground}
            />
          </View>
        </WindowControlsInsetView>
      )}
      {!embedded && <StatusBar style={heroIsDark ? 'light' : 'dark'} />}
      <ScrollView
        ref={scrollViewRef}
        onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        style={{ marginLeft: -bleed.left, marginRight: -bleed.right }}
        contentContainerStyle={{
          paddingBottom: LOG_BAR_PADDING + LOG_BAR_BUTTON + logBarBottom + 20,
        }}
        onContentSizeChange={(_width, height) => {
          if (scrolledToStart.current || !scrollY || height <= scrollY) return
          scrolledToStart.current = true
          scrollViewRef.current?.scrollTo({ y: scrollY, animated: false })
        }}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y
          const away = y > NAME_SCROLLED_AWAY
          if (away !== nameScrolledAway) setNameScrolledAway(away)
          const cardAway =
            visitCardBottom > 0 && y > heroHeight + visitCardBottom
          if (cardAway !== visitCardScrolledAway)
            setVisitCardScrolledAway(cardAway)
        }}
        onScrollEndDrag={
          onScrollY
            ? (e) => onScrollY(e.nativeEvent.contentOffset.y)
            : undefined
        }
        onMomentumScrollEnd={
          onScrollY
            ? (e) => onScrollY(e.nativeEvent.contentOffset.y)
            : undefined
        }
      >
        {}
        <View
          style={{
            position: 'absolute',
            top: -1000,
            left: 0,
            right: 0,
            height: 1000,
            backgroundColor: heroBackground,
          }}
        />
        <View
          onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)}
          style={{
            backgroundColor: heroBackground,
            paddingLeft: bleed.left,
            paddingRight: bleed.right,
          }}
        >
          <View style={column}>
            <ContactHero
              contact={contact}
              heroBackground={heroBackground}
              heroForeground={heroForeground}
              overlap={VISIT_CARD_OVERLAP}
              isActiveStudy={isActiveStudy}
              mostRecentStudy={mostRecentStudy}
              onEdit={editContact}
            />
          </View>
        </View>
        <View style={{ paddingLeft: bleed.left, paddingRight: bleed.right }}>
          <View style={[column, { paddingHorizontal: 14, gap: 16 }]}>
            <View
              onLayout={(e) =>
                setVisitCardBottom(
                  e.nativeEvent.layout.y + e.nativeEvent.layout.height
                )
              }
            >
              <ContactVisitCard
                contact={contact}
                plan={plan}
                actionColor={actionColor}
                lastNote={lastNoteShown ? lastNote : undefined}
                onLastNoteLayout={setLastNoteHeight}
                onOpenLast={() =>
                  lastConversation &&
                  navigation.navigate('Visit Details', {
                    visitId: lastConversation.id,
                  })
                }
                overlap={VISIT_CARD_OVERLAP}
                onEdit={() =>
                  plan &&
                  navigation.navigate('Visit Form', {
                    contactId: contact.id,
                    visitToEditId: plan.visit.id,
                    notAtHome: plan.visit.notAtHome,
                    planFollowUp: true,
                    returnToContacts: true,
                  })
                }
                onDismiss={() => plan && dismissFollowUp(plan.visit)}
                onLogVisit={logVisit}
                onPlan={planVisit}
              />
            </View>
            <ContactReachCard
              contact={contact}
              phoneDisplay={phone?.number?.international}
              onCall={call}
              onText={text}
              onEmail={email}
              onNavigate={navigate}
            />
            <ContactCustomFieldsCard contact={contact} />
            {!hasInformation && (
              <Button
                onPress={editContact}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 56,
                  paddingHorizontal: 18,
                  borderRadius: theme.numbers.borderRadiusLg,
                  backgroundColor: theme.colors.card,
                }}
              >
                <LucideIcon
                  icon={PlusIcon}
                  size={18}
                  color={theme.colors.text}
                />
                <Text style={{ flexShrink: 1, fontFamily: theme.fonts.medium }}>
                  {i18n.t('contactDetails.addInfo')}
                </Text>
              </Button>
            )}
            {latestVisit && (
              <View
                onLayout={(e) => setHistoryY(e.nativeEvent.layout.y)}
                style={{ gap: 12 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    paddingHorizontal: 2,
                  }}
                >
                  <XView
                    style={{
                      alignItems: 'center',
                      flexShrink: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    <XView
                      accessible
                      accessibilityRole='header'
                      style={{
                        gap: 8,
                        alignItems: 'baseline',
                        flexShrink: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <WholeWordsText
                        style={{
                          flexShrink: 1,
                          fontSize: theme.fontSize('lg') - 1,
                          fontFamily: theme.fonts.semiBold,
                        }}
                      >
                        {i18n.t('contactDetails.visitHistory')}
                      </WholeWordsText>
                      {contactVisits.length > 0 && (
                        <Text
                          style={{
                            fontSize: theme.fontSize('sm'),
                            fontFamily: theme.fonts.medium,
                            color: theme.colors.textAlt,
                          }}
                        >
                          {contactVisits.length}
                        </Text>
                      )}
                    </XView>
                  </XView>
                </View>
                {journey && <VisitHistorySummary journey={journey} />}
                <VisitTimeline
                  visits={contactVisits}
                  featuredVisitId={plan?.visit.id}
                  highlightedVisitId={highlightedVisitId}
                  highlightedRef={highlightedRowRef}
                />
              </View>
            )}
            {developerTools && (
              <JsonViewer label={i18n.t('data')} value={contact} />
            )}
            {!createdWithFirstVisit && (
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                  textAlign: 'center',
                  paddingTop: 8,
                }}
              >
                {i18n.t('createdDate', {
                  date: formatDate(contact.createdAt),
                })}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
      {visitCardScrolledAway && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(140)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: LOG_BAR_PADDING,
            paddingBottom: logBarBottom,
            backgroundColor: theme.colors.background,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.border,
          }}
        >
          <View style={[column, { paddingHorizontal: 14 }]}>
            <Button
              onPress={logVisit}
              testID='contact-floating-log-visit'
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minHeight: LOG_BAR_BUTTON,
                borderRadius: LOG_BAR_BUTTON / 2,
                backgroundColor: actionColor,
              }}
            >
              <LucideIcon
                icon={PlusIcon}
                size={16}
                color={actionForeground(actionColor)}
              />
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: actionForeground(actionColor),
                }}
              >
                {i18n.t('logVisitAction')}
              </Text>
            </Button>
          </View>
        </Animated.View>
      )}
    </View>
  )
}

export default ContactDetailsContent
