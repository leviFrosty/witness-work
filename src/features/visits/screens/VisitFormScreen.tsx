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
import { useEffect, useState } from 'react'
import Header from '@/components/ui/layout/Header'
import useTheme from '@/contexts/theme'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section, { SectionRows } from '@/components/ui/inputs/Section'
import { Visit } from '@/types/visit'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import VisitCustomFieldsSection from '@/features/visits/components/VisitCustomFieldsSection'
import { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import moment from 'moment'
import useConversations from '@/stores/conversationStore'
import i18n, { TranslationKey } from '@/lib/locales'
import DateTimePicker from '@/components/ui/DateTimePicker'
import Select from '@/components/ui/Select'
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
import { useToastController } from '@tamagui/toast'
import { RootStackParamList } from '@/types/rootStack'
import { offsetFromMinutes, offsetToMinutes } from '@/lib/notificationOffset'
import {
  reminderRequestId,
  savedReminderOffsetMinutes,
} from '@/lib/reminderSchedule'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'

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
  const theme = useTheme()

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

  const amountOptions = [...Array(1000).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const unitOptions: {
    label: string
    value: moment.unitOfTime.DurationConstructor
  }[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
    label: i18n.t(`${value}_lowercase` as TranslationKey),
    value: value as moment.unitOfTime.DurationConstructor,
  }))

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
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Select
                data={amountOptions}
                onChange={({ value: amount }) =>
                  setNotifyMeOffset({ ...notifyMeOffset, amount })
                }
                placeholder={notifyMeOffset.amount?.toString()}
                value={notifyMeOffset.amount?.toString()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Select
                data={unitOptions}
                onChange={({ value: unit }) =>
                  setNotifyMeOffset({ ...notifyMeOffset, unit })
                }
                value={notifyMeOffset.unit}
              />
            </View>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('before')}
            </Text>
          </View>
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
  const toast = useToastController()

  const conversationToEditViaProps = params.visitToEditId
  const conversationToUpdate = conversationToEditViaProps
    ? [...conversations].find((c) => c.id === conversationToEditViaProps)
    : undefined

  const contactId = params.contactId || conversationToUpdate?.contact.id || ''

  // The entry points that pass `notAtHome` are hidden in data protection mode
  // (see `AddVisitMenu` and `useContactMenuActions`); refusing it here too means a stale deep link or
  // navigation state can't slip one through. Editing an existing not-at-home
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
        // so flipping the switch on has sane defaults. `followUpEnabled`
        // decides whether the draft is persisted.
        followUp: {
          topic: conversationToUpdate.followUp?.topic,
          date: new Date(conversationToUpdate.followUp?.date || new Date()),
          notifyMe: conversationToUpdate.followUp?.notifyMe || false,
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
      note: '',
      followUp: {
        date: moment()
          .add(
            returnVisitTimeOffset?.amount ??
              DEFAULT_RETURN_VISIT_TIME_OFFSET.amount,
            returnVisitTimeOffset?.unit ?? DEFAULT_RETURN_VISIT_TIME_OFFSET.unit
          )
          .toDate(),
        topic: '',
        notifyMe: returnVisitAlwaysNotify,
      },
      isBibleStudy: false,
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
    conversationToUpdate ? !!conversationToUpdate.followUp : !params.notAtHome
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
      if (!followUpEnabled || !conversation.followUp) {
        // `followUp: undefined` (not an omitted key) so
        // `updateConversation`'s spread clears a saved one.
        return { ...conversation, followUp: undefined }
      }
      const { followUp } = conversation
      const minutes = followUp.notifyMe ? offsetToMinutes(notifyMeOffset) : null
      return {
        ...conversation,
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
                    date: new Date(
                      new Date(followUp.date).getTime() - minutes * 60_000
                    ),
                  },
                ],
        },
      }
    }

    noteUserAction('visit')
    if (params.visitToEditId) updateConversation(buildVisit())
    else addConversation(buildVisit())
    toast.show(i18n.t('success'), {
      message: i18n.t(
        conversation.notAtHome ? 'addedNotAtHome' : 'addedConversation'
      ),
      native: true,
    })
    return Promise.resolve(conversation)
  }, [
    addConversation,
    conversation,
    followUpEnabled,
    notifyMeOffset,
    params.visitToEditId,
    toast,
    updateConversation,
  ])

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title=''
          buttonType={params.fromContactForm ? 'none' : 'exit'}
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
                  const succeeded = await submit()
                  if (!succeeded) {
                    // Failed validation if didn't submit
                    return
                  }

                  if (!isEditing)
                    analytics.capture('visit_created', {
                      not_at_home: !!conversation.notAtHome,
                      bible_study: !!conversation.isBibleStudy,
                      has_follow_up: followUpEnabled,
                      reminder_enabled:
                        followUpEnabled && !!conversation.followUp?.notifyMe,
                      custom_field_count: Object.keys(
                        conversation.customFields ?? {}
                      ).length,
                    })

                  await maybeRequestStoreReview({
                    calledGoecodeApiTimes,
                    installedOn,
                    lastTimeRequestedAReview,
                    updateLastTimeRequestedStoreReview,
                  })

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

        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
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
      automaticallyAdjustKeyboardInsets
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
          }}
        >
          <IconButton
            icon={conversation.notAtHome ? CaravanIcon : MessagesSquareIcon}
            size={18}
            iconStyle={{ color: theme.colors.text }}
          />
          <Text style={{ fontSize: 24, fontFamily: theme.fonts.bold }}>
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
              maximumDate={moment().toDate()}
              value={conversation.date}
              onChange={handleDateChange}
              iOSMode='datetime'
            />
          </InputRowContainer>
          <TextInputRow
            label={i18n.t('note')}
            info={
              dataProtectionMode ? i18n.t('dataProtectionNoteHint') : undefined
            }
            textInputProps={{
              placeholder: i18n.t('note_placeholder'),
              multiline: true,
              enterKeyHint: 'enter',
              defaultValue: conversation.note,
              textAlign: 'left',
              onChangeText: (note: string) =>
                setConversation({ ...conversation, note }),
            }}
            lastInSection={notAtHome}
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
                  textAlign: 'left',
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
