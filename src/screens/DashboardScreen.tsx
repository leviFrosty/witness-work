import useTheme from '../contexts/theme'
import { useMemo, useState } from 'react'
import useConversations from '../stores/conversationStore'
import { upcomingFollowUpConversations } from '../lib/conversations'
import ApproachingConversations from '../components/ApproachingConversations'
import ExportTimeSheet, {
  ExportTimeSheetState,
} from '../components/ExportTimeSheet'
import useContacts from '../stores/contactsStore'
import { View } from 'react-native'
import MonthlyRoutine from '../components/MonthlyRoutine'
import ServiceReport from '../components/ServiceReport'
import ContactsList from '../components/ContactsList'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const DashboardScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { conversations } = useConversations()
  const { contacts } = useContacts()
  const [sheet, setSheet] = useState<ExportTimeSheetState>({
    open: false,
    month: 0,
    year: 0,
  })

  const now = useMemo(() => new Date(), [])

  const approachingConversations = useMemo(
    () =>
      upcomingFollowUpConversations({
        currentTime: now,
        conversations,
        withinNextDays: 1,
      }),
    [conversations, now]
  )

  const conversationsWithNotificationOrTopic = useMemo(
    () =>
      approachingConversations.filter(
        (c) => c.followUp?.notifyMe || c.followUp?.topic
      ),
    [approachingConversations]
  )

  const approachingConvosWithActiveContacts = useMemo(
    () =>
      conversationsWithNotificationOrTopic.filter((convo) => {
        const contactIsActive = contacts.find((c) => c.id === convo.contact.id)
        if (contactIsActive) {
          return convo
        }
      }),
    [contacts, conversationsWithNotificationOrTopic]
  )

  return (
    <View style={{ flexGrow: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 85 }}
        automaticallyAdjustKeyboardInsets
        style={{
          flexGrow: 1,
          padding: 15,
          paddingBottom: insets.bottom + 50,
        }}
      >
        <View style={{ gap: 30, paddingBottom: insets.bottom, flex: 1 }}>
          {!!approachingConvosWithActiveContacts.length && (
            <ApproachingConversations
              conversations={approachingConvosWithActiveContacts}
            />
          )}
          <MonthlyRoutine />
          <ServiceReport setSheet={setSheet} />
          <ContactsList />
        </View>
      </KeyboardAwareScrollView>
      <ExportTimeSheet
        sheet={sheet}
        setSheet={setSheet}
        showViewAllMonthsButton
      />
    </View>
  )
}
