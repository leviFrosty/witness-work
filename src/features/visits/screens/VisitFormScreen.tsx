import {
  Caravan as CaravanIcon,
  MessagesSquare as MessagesSquareIcon,
} from 'lucide-react-native'
import { noteUserAction } from '@/lib/userAction'
import { ReactNode, useCallback } from 'react'
import { View } from 'react-native'
import Switch from '@/components/ui/Switch'
import Text from '@/components/ui/MyText'
import * as Crypto from 'expo-crypto'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useRef, useState } from 'react'
import Header from '@/components/ui/layout/Header'
import useTheme from '@/contexts/theme'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section, { SectionRows } from '@/components/ui/inputs/Section'
import { Visit } from '@/types/visit'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import VisitCustomFieldsSection from '@/features/visits/components/VisitCustomFieldsSection'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import NoteInputRow from '@/components/ui/inputs/NoteInputRow'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc, hasNote, noteFields } from '@/lib/richText/notes'
import moment from 'moment'
import useConversations from '@/stores/conversationStore'
import i18n from '@/lib/locales'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@/components/ui/DateTimePicker'
import ReminderOffsetSelect from '@/components/ReminderOffsetSelect'
import Wrapper from '@/components/ui/layout/Wrapper'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_TIME_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import { maybeRequestStoreReview } from '@/features/visits/lib/storeReview'
import useNotifications from '@/hooks/notifications'
import { toast } from '@/stores/toasts'
import { RootStackParamList } from '@/types/rootStack'
import {
  offsetFromMinutes,
  offsetToMinutes,
  reminderFireDate,
} from '@/lib/notificationOffset'
import {
  reminderRequestId,
  savedReminderOffsetMinutes,
} from '@/lib/reminderSchedule'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import useDiscardChangesGuard from '@/hooks/useDiscardChangesGuard'
import useDraftChanged from '@/hooks/useDraftChanged'
import { newVisitIsBibleStudy, plannedFollowUpTopic } from '@/lib/conversations'

/** Inputs for the Follow-up's buddy invitations, supplied by the app tier. */
export type FollowUpBuddiesSlot = (props: {
  visitId: string
  value: string[]
  onChange: (inboxIds: string[]) => void
}) => ReactNode

type Props = NativeStackScreenProps<RootStackParamList, 'Visit Form'> & {
  /** Renders the "Invite Buddies" row in the Follow-up section. */
  renderFollowUpBuddies?: FollowUpBuddiesSlot
}
type MomentOffset = {
  amount?: number | undefined
  unit?: moment.unitOfTime.DurationConstructor | undefined
}

const NotificationSection = (props: {
  conversation: Visit
  setConversation: React.Dispatch<React.SetStateAction<Visit>>
  setNotifyMeOffset: React.Dispatch<React.SetStateAction<MomentOffset>>
  notificationsAllowed: boolean
  turnOnNotifications: () => Promise<boolean>
  notifyMeOffset: MomentOffset
  lastInSection: boolean
}) => {
  const {
    lastInSection,
    conversation,
    notificationsAllowed,
    turnOnNotifications,
    notifyMeOffset,
    setConversation,
    setNotifyMeOffset,
  } = props

  const setNotifyMe = (notifyMe: boolean) => {
    setConversation({
      ...conversation,
      followUp: {
        ...conversation.followUp!,
        notifyMe,
      },
    })
  }

  // Asking here, rather than leaving the switch disabled, matches Buddies.
  const handleNotifyMeChange = async (notifyMe: boolean) => {
    if (notifyMe && !notificationsAllowed && !(await turnOnNotifications()))
      return
    setNotifyMe(notifyMe)
  }

  const notifyMe = conversation.followUp?.notifyMe || false
  const offsetMinutes = offsetToMinutes(notifyMeOffset)
  const reminderPassed =
    notifyMe &&
    notificationsAllowed &&
    !!conversation.followUp &&
    offsetMinutes !== null &&
    new Date(conversation.followUp.date).getTime() - offsetMinutes * 60_000 <=
      Date.now()

  return (
    <SectionRows>
      <InputRowContainer
        label={i18n.t('notifyMe')}
        lastInSection={lastInSection && (!notificationsAllowed || !notifyMe)}
        description={
          notificationsAllowed ? undefined : i18n.t('notifyMe_description')
        }
        controlWidth='auto'
      >
        <Switch
          accessibilityLabel={i18n.t('notifyMe')}
          value={notifyMe}
          onValueChange={(value) => void handleNotifyMeChange(value)}
        />
      </InputRowContainer>
      {notificationsAllowed && notifyMe && (
        <InputRowContainer
          label={i18n.t('notification')}
          lastInSection={lastInSection}
          controlWidth='full'
          description={
            reminderPassed ? i18n.t('reminderTimePassed') : undefined
          }
        >
          <ReminderOffsetSelect
            value={notifyMeOffset}
            onChange={setNotifyMeOffset}
          />
        </InputRowContainer>
      )}
    </SectionRows>
  )
}

const VisitFormScreen = ({
  route,
  navigation,
  renderFollowUpBuddies,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const {
    calledGoecodeApiTimes,
    installedOn,
    lastTimeRequestedAReview,
    updateLastTimeRequestedStoreReview,
    returnVisitTimeOffset,
    returnVisitNotificationOffset,
    returnVisitAlwaysNotify,
    dataProtectionMode,
  } = usePreferences()
  const { params } = route
  const {
    conversations,
    addConversation,
    updateConversation,
    deleteConversation,
  } = useConversations()

  const conversationToEditViaProps = params.visitToEditId
  const conversationToUpdate = conversationToEditViaProps
    ? [...conversations].find((c) => c.id === conversationToEditViaProps)
    : undefined

  const contactId = params.contactId || conversationToUpdate?.contact.id || ''
  const scrollRef = useRef<KeyboardAwareScrollView>(null)

  // The entry points that pass `notAtHome` are hidden in data protection mode
  // (see `useContactMenuActions`); refusing it here too means a stale deep link
  // or navigation state can't slip one through. Editing an existing not-at-home
  // visit still works — its flag comes off the stored record, not from params.
  const notAtHome = dataProtectionMode ? undefined : params.notAtHome

  // When editing, prefer the offset implied by the saved notification so the
  // form doesn't silently rewrite the user's prior choice with the preference
  // default. Falls back to the preference (then a hardcoded default) for new
  // conversations or when no notification was scheduled.
  const initialNotifyMeOffset = (): MomentOffset => {
    const followUp = conversationToUpdate?.followUp
    const savedMinutes =
      followUp && savedReminderOffsetMinutes(new Date(followUp.date), followUp)
    if (typeof savedMinutes === 'number')
      return offsetFromMinutes(savedMinutes) ?? { amount: 0, unit: 'minutes' }
    return {
      amount:
        returnVisitNotificationOffset?.amount ??
        DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET.amount,
      unit:
        returnVisitNotificationOffset?.unit ??
        DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET.unit,
    }
  }

  const [notifyMeOffset, setNotifyMeOffset] = useState<MomentOffset>(
    initialNotifyMeOffset()
  )

  // A new Follow-up's default date: the "Default Follow Up" preference.
  const defaultFollowUpDate = () =>
    moment()
      .add(
        returnVisitTimeOffset?.amount ??
          DEFAULT_RETURN_VISIT_TIME_OFFSET.amount,
        returnVisitTimeOffset?.unit ?? DEFAULT_RETURN_VISIT_TIME_OFFSET.unit
      )
      .toDate()

  // Starts on when the Contact's last real conversation was a Bible Study.
  const [bibleStudyPrefilled] = useState(
    () =>
      !conversationToUpdate &&
      newVisitIsBibleStudy({
        conversations,
        contactId,
        date: new Date(),
        notAtHome,
      })
  )

  // Opened from a Follow-up: show what the user planned to talk about.
  const plannedTopic = conversationToUpdate
    ? undefined
    : plannedFollowUpTopic({
        conversations,
        followUpVisitId: params.followUpVisitId,
      })

  const getConversationDefaultValue = (): Visit => {
    if (conversationToUpdate) {
      return {
        id: conversationToUpdate.id,
        contact: {
          id: conversationToUpdate.contact.id,
        },
        date: new Date(conversationToUpdate.date),
        isBibleStudy: conversationToUpdate.isBibleStudy,
        // Always seed a follow-up draft, even when the saved record has none,
        // so flipping the switch on has the same defaults as a new visit.
        // `followUpEnabled` decides whether the draft is persisted.
        followUp: {
          topic: conversationToUpdate.followUp?.topic,
          date: conversationToUpdate.followUp
            ? new Date(conversationToUpdate.followUp.date)
            : defaultFollowUpDate(),
          notifyMe: conversationToUpdate.followUp
            ? conversationToUpdate.followUp.notifyMe
            : returnVisitAlwaysNotify,
          notifications: conversationToUpdate.followUp?.notifications,
          reminderOffsetMinutes:
            conversationToUpdate.followUp?.reminderOffsetMinutes,
          ...(conversationToUpdate.followUp?.dismissed
            ? { dismissed: true }
            : {}),
          ...(conversationToUpdate.followUp?.buddies?.length
            ? { buddies: conversationToUpdate.followUp.buddies }
            : {}),
        },
        note: conversationToUpdate.note,
        noteDoc: conversationToUpdate.noteDoc,
        notAtHome: conversationToUpdate.notAtHome,
        ...(conversationToUpdate.customFields
          ? { customFields: conversationToUpdate.customFields }
          : {}),
      }
    }
    return {
      id: Crypto.randomUUID(),
      contact: {
        id: contactId || '',
      },
      date: new Date(),
      followUp: {
        date: defaultFollowUpDate(),
        topic: '',
        notifyMe: returnVisitAlwaysNotify,
      },
      isBibleStudy: bibleStudyPrefilled,
      notAtHome,
    }
  }

  const [conversation, setConversation] = useState<Visit>(
    getConversationDefaultValue()
  )

  // The Follow Up switch. Off means the saved Visit carries no `followUp` at
  // all, which hides it from history and every appointment surface. Defaults
  // off for Not at Home (no one answered, so there is rarely a time to plan)
  // and on for a real conversation; when editing, mirrors the saved record.
  const [followUpEnabled, setFollowUpEnabled] = useState<boolean>(() =>
    conversationToUpdate
      ? !!conversationToUpdate.followUp || !!params.planFollowUp
      : !params.notAtHome
  )

  const allowLeave = useDiscardChangesGuard(
    useDraftChanged({
      conversation: {
        ...conversation,
        ...noteFields(getNoteDoc(conversation)),
      },
      followUpEnabled,
      notifyMeOffset,
    })
  )

  const handleFollowUpEnabledChange = (enabled: boolean) => {
    setFollowUpEnabled(enabled)
    if (enabled && conversation.followUp?.dismissed) {
      // Re-enabling is an explicit commitment to the follow-up again, so a
      // prior soft-dismissal no longer applies.
      setConversation({
        ...conversation,
        followUp: { ...conversation.followUp, dismissed: false },
      })
    }
  }

  const setCustomField = (id: string, value: string) => {
    const customFields = { ...conversation.customFields }
    if (value.length === 0) delete customFields[id]
    else customFields[id] = value
    setConversation({ ...conversation, customFields })
  }

  const isEditing = conversationToUpdate?.contact.id

  const { allowed: notificationsAllowed, turnOn: turnOnNotifications } =
    useNotifications()

  const handleDateChange = (_: DateTimePickerEvent, date: Date | undefined) => {
    if (!date) {
      return
    }
    setConversation({
      ...conversation,
      date,
    })
  }

  const handleFollowUpDateChange = (
    _: DateTimePickerEvent,
    date: Date | undefined
  ) => {
    if (!date) {
      return
    }
    setConversation({
      ...conversation,
      followUp: conversation.followUp && {
        ...conversation.followUp,
        date,
      },
    })
  }

  const submit = useCallback(() => {
    // Saves only the reminder intent. `useReconciledReminders` schedules (or
    // cancels) this device's OS reminder from it, once permission allows.
    const buildVisit = (): Visit => {
      const visit = { ...conversation, ...noteFields(getNoteDoc(conversation)) }
      if (!followUpEnabled || !visit.followUp) {
        // `followUp: undefined` (not an omitted key) so
        // `updateConversation`'s spread clears a saved one.
        return { ...visit, followUp: undefined }
      }
      const { followUp } = visit
      const minutes = followUp.notifyMe ? offsetToMinutes(notifyMeOffset) : null
      return {
        ...visit,
        followUp: {
          ...followUp,
          reminderOffsetMinutes: minutes ?? undefined,
          // The fire time, for older app versions on other devices.
          notifications:
            minutes === null
              ? []
              : [
                  {
                    id: reminderRequestId('visit', conversation.id),
                    date: reminderFireDate(new Date(followUp.date), minutes),
                  },
                ],
        },
      }
    }

    noteUserAction('visit')
    const visit = buildVisit()
    if (params.visitToEditId) updateConversation(visit)
    else addConversation(visit)
    toast.success(i18n.t('success'), {
      message: i18n.t(
        params.visitToEditId
          ? 'updated'
          : conversation.notAtHome
            ? 'addedNotAtHome'
            : 'addedConversation'
      ),
    })
    return Promise.resolve(visit)
  }, [
    addConversation,
    conversation,
    followUpEnabled,
    notifyMeOffset,
    params.visitToEditId,
    updateConversation,
  ])

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title=''
          noInsets={params.overSheet}
          buttonType={params.fromContactForm ? 'none' : 'exit'}
          onPressLeftIcon={
            params.overSheet ? () => navigation.goBack() : undefined
          }
          leftElement={
            params.fromContactForm ? (
              <Button
                onPress={() =>
                  params.returnToContacts
                    ? navigation.goBack()
                    : navigation.replace('Contact Details', {
                        id: params.contactId!,
                      })
                }
              >
                <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                  {i18n.t('skip')}
                </Text>
              </Button>
            ) : undefined
          }
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
              <Button
                onPress={async () => {
                  const saved = await submit()
                  if (!saved) {
                    // Failed validation if didn't submit
                    return
                  }

                  if (!isEditing)
                    analytics.capture('visit_created', {
                      not_at_home: !!conversation.notAtHome,
                      bible_study: !!conversation.isBibleStudy,
                      bible_study_prefilled: bibleStudyPrefilled,
                      has_follow_up: followUpEnabled,
                      reminder_enabled:
                        followUpEnabled && !!conversation.followUp?.notifyMe,
                      custom_field_count: Object.keys(
                        conversation.customFields ?? {}
                      ).length,
                      has_note: hasNote(saved),
                      has_formatting: !!saved.noteDoc,
                      note_photos: saved.noteDoc
                        ? richTextImages(saved.noteDoc.doc).length
                        : 0,
                      ...params.logVisit,
                    })

                  await maybeRequestStoreReview({
                    calledGoecodeApiTimes,
                    installedOn,
                    lastTimeRequestedAReview,
                    updateLastTimeRequestedStoreReview,
                  })

                  allowLeave()

                  if (params.returnToContacts || params.returnOnSave) {
                    navigation.goBack()
                  } else if (isEditing) {
                    navigation.pop()
                  } else if (params.contactId) {
                    navigation.replace('Contact Details', {
                      id: params.contactId,
                    })
                  } else {
                    navigation.popToTop()
                  }
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    textDecorationLine: 'underline',
                    fontSize: 16,
                  }}
                >
                  {isEditing ? i18n.t('save') : i18n.t('add')}
                </Text>
              </Button>
            </View>
          }
        />
      ),
    })
  }, [
    allowLeave,
    bibleStudyPrefilled,
    calledGoecodeApiTimes,
    conversation.id,
    conversation.followUp,
    conversation.isBibleStudy,
    conversation.notAtHome,
    conversation.customFields,
    conversationToUpdate?.contact.id,
    followUpEnabled,
    installedOn,
    isEditing,
    lastTimeRequestedAReview,
    navigation,
    params,
    submit,
    theme.colors.text,
    theme.colors.textInverse,
    updateLastTimeRequestedStoreReview,
  ])

  const handleRequestDelete = () =>
    confirmDestructive({
      title: i18n.t('deleteConversation'),
      description: i18n.t('deleteConversation_description'),
      onConfirm: () => {
        deleteConversation(conversation.id)

        toast.success(i18n.t('success'), {
          message: i18n.t('deleted'),
        })
        allowLeave()
        navigation.goBack()
      },
    })

  const getTitle = () => {
    if (params?.visitToEditId) {
      if (notAtHome) {
        return i18n.t('editNotAtHome')
      }
      return i18n.t('editConversation')
    }

    if (notAtHome) {
      return i18n.t('addNotAtHome')
    }
    return i18n.t('addConversation')
  }

  return (
    <KeyboardAwareScrollView
      ref={scrollRef}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps='handled'
      contentContainerStyle={{ paddingBottom: insets.bottom + 50 }}
      style={{
        backgroundColor: theme.colors.background,
      }}
    >
      <Wrapper
        insets='none'
        style={{
          gap: 24,
          marginTop: 4,
          paddingHorizontal: 12,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 680,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 13,
            paddingTop: 12,
          }}
        >
          <IconButton
            icon={conversation.notAtHome ? CaravanIcon : MessagesSquareIcon}
            size={18}
            iconStyle={{ color: theme.colors.text }}
          />
          <Text
            accessibilityRole='header'
            style={{ fontSize: 24, fontFamily: theme.fonts.bold }}
          >
            {getTitle()}
          </Text>
        </View>
        <Section>
          <InputRowContainer
            label={i18n.t('date')}
            justifyContent='space-between'
            controlWidth='auto'
          >
            <DateTimePicker
              value={conversation.date}
              onChange={handleDateChange}
              iOSMode='datetime'
            />
          </InputRowContainer>
          <NoteInputRow
            label={i18n.t('note')}
            description={
              plannedTopic
                ? i18n.t('plannedTopic', { topic: plannedTopic })
                : undefined
            }
            info={
              dataProtectionMode ? i18n.t('dataProtectionNoteHint') : undefined
            }
            placeholder={i18n.t('note_placeholder')}
            note={conversation}
            // Functional: the note editor calls this after other fields may
            // have changed.
            onChange={(note) =>
              setConversation((current) => ({ ...current, ...note }))
            }
            surface='visit'
            // A photo of someone's home is householder data.
            allowImages={!dataProtectionMode}
            lastInSection={notAtHome}
            testID='visit-note'
          />
          {!notAtHome && (
            <InputRowSwitch
              label={i18n.t('conductedBibleStudy')}
              value={conversation.isBibleStudy}
              onValueChange={(isBibleStudy) =>
                setConversation({ ...conversation, isBibleStudy })
              }
              lastInSection
            />
          )}
        </Section>
        <VisitCustomFieldsSection
          customFields={conversation.customFields}
          setCustomField={setCustomField}
          contactId={contactId}
          visitId={conversation.id}
          visitDate={conversation.date}
          scrollBy={(dy) =>
            scrollRef.current?.scrollForExtraHeightOnAndroid(dy)
          }
        />
        <Section>
          <InputRowSwitch
            label={i18n.t('followUp')}
            info={i18n.t('followUp_description')}
            value={followUpEnabled}
            onValueChange={handleFollowUpEnabledChange}
            lastInSection={!followUpEnabled}
          />
          {followUpEnabled && (
            <>
              <InputRowContainer
                label={i18n.t('followUpDate')}
                justifyContent='space-between'
                controlWidth='auto'
              >
                <DateTimePicker
                  value={conversation.followUp!.date}
                  onChange={handleFollowUpDateChange}
                  iOSMode='datetime'
                />
              </InputRowContainer>
              <TextInputRow
                label={i18n.t('topic')}
                textInputProps={{
                  placeholder: i18n.t('topic_placeholder'),
                  multiline: true,
                  enterKeyHint: 'enter',
                  defaultValue: conversation.followUp?.topic,
                  textAlign: 'start',
                  onChangeText: (topic: string) =>
                    setConversation({
                      ...conversation,
                      followUp: conversation.followUp && {
                        ...conversation.followUp,
                        topic,
                      },
                    }),
                }}
              />
              {!dataProtectionMode &&
                renderFollowUpBuddies?.({
                  visitId: conversation.id,
                  value: conversation.followUp?.buddies ?? [],
                  onChange: (buddies) =>
                    setConversation({
                      ...conversation,
                      followUp: conversation.followUp && {
                        ...conversation.followUp,
                        buddies: buddies.length > 0 ? buddies : undefined,
                      },
                    }),
                })}
              <NotificationSection
                conversation={conversation}
                notificationsAllowed={notificationsAllowed}
                turnOnNotifications={turnOnNotifications}
                notifyMeOffset={notifyMeOffset}
                setConversation={setConversation}
                setNotifyMeOffset={setNotifyMeOffset}
                lastInSection
              />
            </>
          )}
        </Section>
        {isEditing && (
          <Button
            noTransform
            onPress={handleRequestDelete}
            accessibilityRole='button'
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.error,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
              }}
            >
              {i18n.t('deleteEllipsis')}
            </Text>
          </Button>
        )}
      </Wrapper>
    </KeyboardAwareScrollView>
  )
}

export default VisitFormScreen
