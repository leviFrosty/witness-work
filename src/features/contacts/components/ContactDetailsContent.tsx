import { Plus as PlusIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { getLocales } from 'expo-localization'
import { StatusBar } from 'expo-status-bar'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sheet } from 'tamagui'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
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
import { Contact } from '@/types/contact'
import { RootStackNavigation } from '@/types/rootStack'
import AddHistoryActions from '@/features/contacts/components/AddHistoryActions'
import AddHistoryPopover from '@/features/contacts/components/AddHistoryPopover'
import ContactCustomFieldsCard from '@/features/contacts/components/ContactCustomFieldsCard'
import ContactHeaderActions from '@/features/contacts/components/ContactHeaderActions'
import ContactHero from '@/features/contacts/components/ContactHero'
import ContactReachCard from '@/features/contacts/components/ContactReachCard'
import DismissContactSheet from '@/features/contacts/components/DismissContactSheet'
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
  navigation: Pick<
    RootStackNavigation,
    'navigate' | 'replace' | 'popToTop' | 'setOptions'
  >
  embedded?: boolean
}

const AddSheet = ({
  open,
  setOpen,
  navigation,
  contact,
  embedded,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  navigation: Pick<RootStackNavigation, 'navigate' | 'replace'>
  contact: Contact
  embedded: boolean
}) => (
  <Sheet
    open={open}
    onOpenChange={setOpen}
    dismissOnSnapToBottom
    snapPoints={[55]}
    modal
  >
    <Sheet.Handle />
    <Sheet.Overlay zIndex={100_000 - 1} />
    <Sheet.Frame>
      <View style={{ padding: 30 }}>
        <AddHistoryActions
          contactId={contact.id}
          navigation={navigation}
          embedded={embedded}
          onAction={() => setOpen(false)}
        />
      </View>
    </Sheet.Frame>
  </Sheet>
)

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

  const [sheetOpen, setSheetOpen] = useState(false)
  const [dismissSheetOpen, setDismissSheetOpen] = useState(false)

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
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 20,
                position: 'absolute',
                right: 0,
              }}
            >
              <ContactHeaderActions
                contactId={id}
                color={heroForeground}
                embedded={false}
                navigation={navigation}
                onDismiss={() => setDismissSheetOpen(true)}
              />
            </View>
          }
        />
      ),
    })
  }, [embedded, navigation, heroForeground, heroBackground, id])

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

  const logVisit = () => {
    const params = { contactId: contact.id, returnToContacts: embedded }
    if (embedded) navigation.navigate('Visit Form', params)
    else navigation.replace('Visit Form', params)
  }

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
          <ContactHeaderActions
            contactId={id}
            color={heroForeground}
            embedded
            navigation={navigation}
            onDismiss={() => setDismissSheetOpen(true)}
          />
          <AddHistoryPopover
            contactId={contact.id}
            navigation={navigation}
            foregroundColor={heroForeground}
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
              {embedded ? (
                <AddHistoryPopover
                  contactId={contact.id}
                  navigation={navigation}
                />
              ) : (
                <Button onPress={() => setSheetOpen(true)}>
                  <XView
                    style={{
                      borderColor: theme.colors.text,
                      borderWidth: 1,
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                  >
                    <IconButton
                      icon={PlusIcon}
                      size='sm'
                      iconStyle={{ color: theme.colors.text }}
                    />
                    <Text style={{ fontSize: theme.fontSize('sm') }}>
                      {i18n.t('add')}
                    </Text>
                  </XView>
                </Button>
              )}
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
              <View
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: theme.numbers.borderRadiusLg,
                  paddingVertical: 30,
                  paddingHorizontal: 20,
                }}
              >
                <Text
                  style={{ color: theme.colors.textAlt, textAlign: 'center' }}
                >
                  {i18n.t('thisContactHasNoConversations')}
                </Text>
              </View>
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
      <AddSheet
        open={sheetOpen}
        setOpen={setSheetOpen}
        navigation={navigation}
        contact={contact}
        embedded={embedded}
      />
      <DismissContactSheet
        open={dismissSheetOpen}
        setOpen={setDismissSheetOpen}
        contact={contact}
      />
    </View>
  )
}

export default ContactDetailsContent
