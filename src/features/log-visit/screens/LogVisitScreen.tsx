import { UserPlus as UserPlusIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { BackHandler, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Haptics from '@/lib/haptics'
import { analytics } from '@/lib/analytics'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import { buildConversationIndex } from '@/lib/conversationIndex'
import { buildSuggestedContacts } from '@/lib/suggestedContacts'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { showUndoToast } from '@/stores/undoToast'
import useLocationSnapshot from '@/hooks/useLocationSnapshot'
import Empty from '@/components/ui/Empty'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import type {
  LogVisitAttribution,
  LogVisitPickedFrom,
  RootStackParamList,
} from '@/types/rootStack'
import type { Contact } from '@/types/contact'
import {
  buildContactsFuse,
  searchContactsFuzzy,
} from '@/features/contacts/lib/contactsSearch'
import useLogNotAtHome from '@/features/visits/hooks/useLogNotAtHome'
import LogVisitHeader from '@/features/log-visit/components/LogVisitHeader'
import LogVisitContactList from '@/features/log-visit/components/LogVisitContactList'
import LogVisitOutcome from '@/features/log-visit/components/LogVisitOutcome'
import {
  buildBrowseItems,
  buildSearchItems,
} from '@/features/log-visit/lib/logVisitList'

type Props = NativeStackScreenProps<RootStackParamList, 'Log Visit'>

type Picked = { contact: Contact; pickedFrom: LogVisitPickedFrom }

/**
 * Log Visit, from the + menu: pick a Contact (suggested first), then say how it
 * went. Had a Conversation continues to the Visit Form, which returns to where
 * the User started; Not at Home logs right away with an Undo toast. Data
 * protection mode has no Not at Home, so picking goes straight to the form.
 */
export default function LogVisitScreen({ navigation }: Props) {
  const theme = useTheme()
  const contacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)
  const stalenessBreakpoints = usePreferences((s) => s.stalenessBreakpoints)
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const notAtHome = useLogNotAtHome()
  const nearby = useLocationSnapshot()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Picked | null>(null)
  /** Set once the flow logs or hands off, so closing isn't a dismissal. */
  const handedOff = useRef(false)
  const step = useRef<'pick_contact' | 'choose_outcome'>('pick_contact')

  useEffect(() => {
    step.current = picked ? 'choose_outcome' : 'pick_contact'
  }, [picked])

  // Android's back returns to the list from the outcome step.
  useEffect(() => {
    if (!picked) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setPicked(null)
        return true
      }
    )
    return () => subscription.remove()
  }, [picked])

  useEffect(() => {
    return () => {
      if (handedOff.current) return
      analytics.capture('log_visit_dismissed', { step: step.current })
    }
  }, [])

  const actives = filterActivesContacts(contacts)
  const index = buildConversationIndex(conversations, stalenessBreakpoints)
  const suggested = buildSuggestedContacts({
    contacts: actives,
    conversations,
    index,
    here: nearby.here,
    currentTime: new Date(nearby.at),
  })
  const nearbyShown = suggested.sections.some((s) => s.key === 'nearby')
  const fuse = buildContactsFuse(actives, conversations)
  const items = query.trim()
    ? buildSearchItems(query, searchContactsFuzzy(query, fuse, actives))
    : buildBrowseItems({ suggested, contacts: actives })

  const attribution = (
    pickedFrom: LogVisitPickedFrom
  ): LogVisitAttribution => ({
    source: 'quick_action',
    picked_from: pickedFrom,
    nearby_shown: nearbyShown,
  })

  const close = () => navigation.goBack()

  const openVisitForm = ({ contact, pickedFrom }: Picked) => {
    handedOff.current = true
    // Replaces the picker, so saving goes back to where the User started.
    navigation.replace('Visit Form', {
      contactId: contact.id,
      returnOnSave: true,
      logVisit: attribution(pickedFrom),
    })
  }

  const addContact = (name?: string) => {
    handedOff.current = true
    // Its form continues to the Visit Form, then back to where they started.
    navigation.replace('Contact Form', {
      id: Crypto.randomUUID(),
      name,
      returnToContacts: true,
      logVisit: attribution('new_contact'),
    })
  }

  const pick = (choice: Picked) => {
    if (dataProtectionMode) openVisitForm(choice)
    else setPicked(choice)
  }

  const logNotAtHome = ({ contact, pickedFrom }: Picked) => {
    Haptics.light()
    const visit = notAtHome.log(contact.id, attribution(pickedFrom))
    handedOff.current = true
    showUndoToast({
      message: i18n.t('logVisit_notAtHomeLogged', { name: contact.name }),
      onUndo: () => notAtHome.undo(visit),
    })
    close()
  }

  // The picked Contact can be deleted elsewhere (e.g. sync) mid-flow.
  const pickedContact = picked
    ? actives.find((c) => c.id === picked.contact.id)
    : undefined

  return (
    <View
      testID='log-visit-screen'
      onTouchStart={nearby.markInteracted}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <LogVisitHeader
        onClose={close}
        onBack={picked ? () => setPicked(null) : undefined}
        onNewContact={picked ? undefined : () => addContact()}
      />
      {picked && pickedContact ? (
        <LogVisitOutcome
          contact={pickedContact}
          dueFollowUp={suggested.dueFollowUpById.get(pickedContact.id)}
          onConversation={() => openVisitForm(picked)}
          onNotAtHome={() => logNotAtHome(picked)}
        />
      ) : actives.length === 0 ? (
        <Empty
          style={{ flex: 1, margin: 16 }}
          icon={
            <LucideIcon
              icon={UserPlusIcon}
              size={24}
              color={theme.colors.text}
            />
          }
          title={i18n.t('noContactsYet')}
          description={i18n.t('logVisit_emptyBody')}
          action={
            <Button
              testID='log-visit-empty-add-contact'
              onPress={() => addContact()}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: theme.colors.accent,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('addContact')}
              </Text>
            </Button>
          }
        />
      ) : (
        <LogVisitContactList
          items={items}
          query={query}
          onQueryChange={setQuery}
          showsNearbyHint={nearby.showsHint}
          onTurnOnNearby={async () => {
            const granted = await nearby.turnOn()
            analytics.capture('log_visit_location_answered', { granted })
          }}
          index={index}
          onPick={(item) =>
            pick({ contact: item.contact, pickedFrom: item.pickedFrom })
          }
          onAddNew={(name) => addContact(name)}
        />
      )}
    </View>
  )
}
