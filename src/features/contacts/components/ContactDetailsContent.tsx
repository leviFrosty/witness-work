import { MessageCircle as MessageCircleIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { getLocales } from 'expo-localization'
import { StatusBar } from 'expo-status-bar'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Empty from '@/components/ui/Empty'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import Header from '@/components/ui/layout/Header'
import Wrapper from '@/components/ui/layout/Wrapper'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { navigateTo } from '@/lib/address'
import { getReadableTextColor, relativeLuminance } from '@/lib/color'
import {
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
} from '@/lib/conversations'
import { formatDate } from '@/lib/dates'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'
import ContactCustomFieldsCard from '@/features/contacts/components/ContactCustomFieldsCard'
import ContactDetailsActions, {
  AddVisitMenu,
  type ContactDetailsNavigation,
} from '@/features/contacts/components/ContactDetailsActions'
import ContactHero from '@/features/contacts/components/ContactHero'
import ContactReachCard from '@/features/contacts/components/ContactReachCard'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import UpNextCard from '@/features/contacts/components/UpNextCard'
import VisitJourneyCard from '@/features/contacts/components/VisitJourneyCard'
import VisitTimeline from '@/features/contacts/components/VisitTimeline'
import useContactHeroBackground from '@/features/contacts/hooks/useContactHeroBackground'
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
  getUpNext,
  sortVisitsNewestFirst,
} from '@/features/contacts/lib/visitTimeline'

// The details stay readable on wide screens; the hero's color goes edge to edge.
const CONTENT_MAX_WIDTH = 760

type Props = {
  id: string
  highlightedVisitId?: string
  navigation: ContactDetailsNavigation
  embedded?: boolean
}

const ContactDetailsContent = ({
  id,
  highlightedVisitId,
  navigation,
  embedded = false,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const bleed = useHorizontalBleed()
  // Beside the list, the pane's end corner is a windowed iPad app's top corner
  // when the app reads right to left on a left-to-right system, or the reverse.
  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)
  const { developerTools, defaultNavigationMapProvider } = usePreferences()
  const { contacts, customFieldDefs } = useContacts()
  const { conversations } = useConversations()
  const contact = contacts.find((c) => c.id === id)
  const heroBackground = useContactHeroBackground(contact)
  // Hero tint is user-controllable per contact, so pick a contrasting
  // foreground from the resolved background for the hero and header chrome.
  const heroForeground = getReadableTextColor(heroBackground)
  const heroIsDark = relativeLuminance(heroBackground) <= 0.45
  // At accessibility text sizes the Conversation History heading takes the
  // whole row and Add moves under it, instead of being pushed off the screen.
  const stackHistoryHeader = useAccessibilityTextSize()

  const contactVisits = sortVisitsNewestFirst(
    conversations.filter((visit) => visit.contact.id === id)
  )
  const upNext = getUpNext(contactVisits)
  const journey = getJourney(contactVisits, new Date(), upNext?.date)

  const scrollViewRef = useRef<ScrollView>(null)
  const highlightedRowRef = useRef<View>(null)
  const hasHighlightedVisit = contactVisits.some(
    (visit) => visit.id === highlightedVisitId
  )

  // Opened from the widget deep link (`witnesswork://contact/:id/:convId`):
  // scroll the highlighted visit into view once the rail has laid out.
  useEffect(() => {
    if (!highlightedVisitId || !hasHighlightedVisit) return
    const timer = setTimeout(() => {
      const scrollView = scrollViewRef.current
      const row = highlightedRowRef.current
      if (!scrollView || !row) return
      row.measureLayout(
        // @ts-expect-error — RN accepts a host component ref here.
        scrollView,
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
          title=''
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
  }, [contact, embedded, navigation, heroForeground, heroBackground])

  if (!contact) {
    return (
      <Wrapper style={{ flexGrow: 1, padding: 10 }}>
        <Text style={{ fontSize: 18, marginTop: 15 }}>
          {i18n.t('contactNotFoundWithId', { id })}
        </Text>
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

  // Push forms over the details so Back and Save both return here.
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
    })

  const isActiveStudy = contactStudiedForGivenMonth({
    contact,
    conversations,
    month: new Date(),
  })
  const mostRecentStudy = contactMostRecentStudy({ conversations, contact })

  const column = {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
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
        // Full width, out under the side insets too, so the hero's color runs
        // edge to edge like the header's; the content keeps its column.
        style={{ marginLeft: -bleed.left, marginRight: -bleed.right }}
        contentContainerStyle={{
          paddingBottom: embedded ? 24 : insets.bottom + 60,
        }}
      >
        {/* Keeps overscroll above the hero tinted. */}
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
              overlapped={!!upNext}
              isActiveStudy={isActiveStudy}
              mostRecentStudy={mostRecentStudy}
              onEdit={editContact}
            />
          </View>
        </View>
        <View style={{ paddingLeft: bleed.left, paddingRight: bleed.right }}>
          <View
            style={[
              column,
              {
                paddingHorizontal: 14,
                gap: 16,
                paddingTop: upNext ? 0 : 16,
              },
            ]}
          >
            {upNext && (
              <UpNextCard
                upNext={upNext}
                overlap
                onOpen={() =>
                  navigation.navigate('Visit Details', {
                    visitId: upNext.visit.id,
                  })
                }
                onLogVisit={logVisit}
                onReschedule={() =>
                  navigation.navigate('RescheduleVisit', {
                    contactId: contact.id,
                    visitId: upNext.visit.id,
                  })
                }
                onNavigate={navigate}
              />
            )}
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
              <Text
                style={{ color: theme.colors.textAlt, paddingHorizontal: 2 }}
              >
                {i18n.t('noPersonalInformationSaved')}
              </Text>
            )}
            {developerTools && (
              <JsonViewer label={i18n.t('data')} value={contact} />
            )}
            <View style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: stackHistoryHeader ? 'column' : 'row',
                  alignItems: stackHistoryHeader ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingHorizontal: 2,
                }}
              >
                {/* The count and info button wrap under a heading that fills
                  its row, so a long word never has to break. */}
                <XView
                  style={{
                    alignItems: 'center',
                    flexShrink: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <XView
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
                      {i18n.t('conversationHistory')}
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
                  {journey && (
                    <InfoPopover
                      inline
                      title={i18n.t('conversationHistory')}
                      description={i18n.t('contactDetails.historyInfo')}
                    />
                  )}
                </XView>
                <AddVisitMenu
                  contact={contact}
                  navigation={navigation}
                  color={theme.colors.text}
                  compact
                />
              </View>
              {journey ? (
                <>
                  <VisitJourneyCard journey={journey} upNext={upNext} />
                  <VisitTimeline
                    visits={contactVisits}
                    upNext={upNext}
                    highlightedVisitId={highlightedVisitId}
                    highlightedRef={highlightedRowRef}
                    onPressUpNext={() =>
                      scrollViewRef.current?.scrollTo({ y: 0, animated: true })
                    }
                  />
                </>
              ) : (
                <Empty
                  icon={
                    <LucideIcon
                      icon={MessageCircleIcon}
                      size={24}
                      color={theme.colors.text}
                    />
                  }
                  title={i18n.t('noConversationYet')}
                  description={i18n.t('thisContactHasNoConversations')}
                />
              )}
            </View>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                textAlign: 'center',
                paddingTop: 8,
              }}
            >
              {i18n.t('createdDate', { date: formatDate(contact.createdAt) })}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default ContactDetailsContent
