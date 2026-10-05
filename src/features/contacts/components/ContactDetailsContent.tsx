import { MessageCircle as MessageCircleIcon } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'
import { getLocales } from 'expo-localization'
import { StatusBar } from 'expo-status-bar'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Empty from '@/components/ui/Empty'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Header from '@/components/ui/layout/Header'
import Wrapper from '@/components/ui/layout/Wrapper'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
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
import {
  canNavigateTo,
  contactAddressLines,
} from '@/features/contacts/lib/contactChannels'
import {
  getJourney,
  getUpNext,
  sortVisitsNewestFirst,
} from '@/features/contacts/lib/visitTimeline'

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
  const { developerTools, defaultNavigationMapProvider } = usePreferences()
  const { contacts, customFieldDefs } = useContacts()
  const { conversations } = useConversations()
  const contact = contacts.find((c) => c.id === id)
  const heroBackground = useContactHeroBackground(contact)
  // Hero tint is user-controllable per contact, so pick a contrasting
  // foreground from the resolved background for the hero and header chrome.
  const heroForeground = getReadableTextColor(heroBackground)
  const heroIsDark = relativeLuminance(heroBackground) <= 0.45

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
          {i18n.t('contactNotFoundForProvidedId')} {id}
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {embedded && (
        <View
          style={{
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 20,
            padding: 16,
            backgroundColor: heroBackground,
          }}
        >
          <ContactDetailsActions
            contact={contact}
            navigation={navigation}
            embedded
            color={heroForeground}
          />
        </View>
      )}
      {!embedded && <StatusBar style={heroIsDark ? 'light' : 'dark'} />}
      <ScrollView
        ref={scrollViewRef}
        style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}
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
        <ContactHero
          contact={contact}
          heroBackground={heroBackground}
          heroForeground={heroForeground}
          overlapped={!!upNext}
          isActiveStudy={isActiveStudy}
          mostRecentStudy={mostRecentStudy}
          onEdit={editContact}
        />
        <View
          style={{
            paddingHorizontal: 14,
            gap: 16,
            paddingTop: upNext ? 0 : 16,
          }}
        >
          {upNext && (
            <UpNextCard
              upNext={upNext}
              overlap
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
            <Text style={{ color: theme.colors.textAlt, paddingHorizontal: 2 }}>
              {i18n.t('noPersonalInformationSaved')}
            </Text>
          )}
          {developerTools && (
            <JsonViewer label={i18n.t('data')} value={contact} />
          )}
          <View style={{ gap: 12 }}>
            <XView
              style={{ justifyContent: 'space-between', paddingHorizontal: 2 }}
            >
              <XView style={{ alignItems: 'center' }}>
                <XView style={{ gap: 8, alignItems: 'baseline' }}>
                  <Text
                    style={{
                      fontSize: theme.fontSize('lg') - 1,
                      fontFamily: theme.fonts.semiBold,
                    }}
                  >
                    {i18n.t('conversationHistory')}
                  </Text>
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
                contactId={contact.id}
                navigation={navigation}
                color={theme.colors.text}
                compact
              />
            </XView>
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
            {i18n.t('created')} {formatDate(contact.createdAt)}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

export default ContactDetailsContent
