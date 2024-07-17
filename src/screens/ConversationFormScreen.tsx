import { useCallback } from 'react'
import { View, Platform, Alert } from 'react-native'
import Text from '../components/MyText'
import * as Notifications from 'expo-notifications'
import * as Crypto from 'expo-crypto'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Sentry from '@sentry/react-native'
import { RootStackParamList } from '../stacks/RootStack'
import useContacts from '../stores/contactsStore'
import { useEffect, useState } from 'react'
import Header from '../components/layout/Header'
import useTheme from '../contexts/theme'
import Divider from '../components/Divider'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '../components/inputs/Section'
import { Conversation, Notification } from '../types/conversation'
import InputRowContainer from '../components/inputs/InputRowContainer'
import RNDateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import TextInputRow from '../components/inputs/TextInputRow'
import CheckboxWithLabel from '../components/inputs/CheckboxWithLabel'
import { Contact } from '../types/contact'
import moment from 'moment'
import useConversations from '../stores/conversationStore'
import i18n, { TranslationKey } from '../lib/locales'
import AndroidDateTimePicker from '../components/AndroidDateTimePicker'
import Checkbox from 'expo-checkbox'
import Select from '../components/Select'
import Wrapper from '../components/layout/Wrapper'
import IconButton from '../components/IconButton'
import {
  faCaravan,
  faComments,
  faIdCard,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import _ from 'lodash'
import Button from '../components/Button'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePreferences } from '../stores/preferences'
import { maybeRequestStoreReview } from '../lib/storeReview'
import useNotifications from '../hooks/notifications'
import { getLocales } from 'expo-localization'
import { useToastController } from '@tamagui/toast'

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation Form'>
type MomentOffset = {
  amount?: number | undefined
  unit?: moment.unitOfTime.DurationConstructor | undefined
}

const NotificationSection = (props: {
  conversation: Conversation
  setConversation: React.Dispatch<React.SetStateAction<Conversation>>
  setNotifyMeOffset: React.Dispatch<React.SetStateAction<MomentOffset>>
  notificationsAllowed: boolean
  notifyMeOffset: MomentOffset
}) => {
  const {
    conversation,
    notificationsAllowed,
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
    <InputRowContainer label={i18n.t('notification')} lastInSection>
      <View style={{ gap: 15, flex: 1 }}>
        <View
          style={{
            justifyContent: 'flex-end',
            flex: 1,
            flexDirection: 'row',
          }}
        >
          <CheckboxWithLabel
            label={i18n.t('notifyMe')}
            value={conversation.followUp?.notifyMe || false}
            setValue={setNotifyMe}
            disabled={!notificationsAllowed}
            description={i18n.t('notifyMe_description')}
            descriptionOnlyOnDisabled
          />
        </View>
        {notificationsAllowed && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Select
                data={amountOptions}
                dropdownPosition='top'
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
                dropdownPosition='top'
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
        )}
      </View>
    </InputRowContainer>
  )
}

const ContactRow = ({ selectedContact }: { selectedContact: Contact }) => {
  const theme = useTheme()

  return (
    <Section>
      <View
        style={{
          gap: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingRight: 20,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <IconButton icon={faIdCard} />
          <Text style={{ fontFamily: theme.fonts.semiBold, fontSize: 16 }}>
            {selectedContact?.name}
          </Text>
        </View>
      </View>
    </Section>
  )
}

const ConversationFormScreen = ({ route, navigation }: Props) => {
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
  } = usePreferences()
  const { params } = route
  const { contacts } = useContacts()
  const {
    conversations,
    addConversation,
    updateConversation,
    deleteConversation,
  } = useConversations()
  const toast = useToastController()

  const conversationToEditViaProps = params.conversationToEditId
  const conversationToUpdate = conversationToEditViaProps
    ? [...conversations].find((c) => c.id === conversationToEditViaProps)
    : undefined

  const contactId = params.contactId || conversationToUpdate?.contact.id || ''

  const notAtHome = params.notAtHome

  const [notifyMeOffset, setNotifyMeOffset] = useState<MomentOffset>({
    amount: returnVisitNotificationOffset?.amount || 2,
    unit: returnVisitNotificationOffset?.unit || 'hours',
  })

  const getConversationDefaultValue = (): Conversation => {
    if (conversationToUpdate) {
      return {
        id: conversationToUpdate.id,
        contact: {
          id: conversationToUpdate.contact.id,
        },
        date: new Date(conversationToUpdate.date),
        isBibleStudy: conversationToUpdate.isBibleStudy,
        followUp: {
          topic: conversationToUpdate.followUp?.topic,
          date: new Date(conversationToUpdate.followUp?.date || new Date()),
          notifyMe: conversationToUpdate.followUp?.notifyMe || false,
          notifications: conversationToUpdate.followUp?.notifications,
        },
        note: conversationToUpdate.note,
        notAtHome: conversationToUpdate.notAtHome,
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
          .add(returnVisitTimeOffset?.amount, returnVisitTimeOffset?.unit)
          .toDate(),
        topic: '',
        notifyMe: returnVisitAlwaysNotify,
      },
      isBibleStudy: false,
      notAtHome: params.notAtHome,
    }
  }

  const [conversation, setConversation] = useState<Conversation>(
    getConversationDefaultValue()
  )

  const selectedContact = contacts.find((c) => c.id === contactId)
  const isEditing = conversationToUpdate?.contact.id

  const { allowed: notificationsAllowed } = useNotifications()

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
    return new Promise((resolve) => {
      const cancelExistingNotification = () => {
        conversationToUpdate?.followUp?.notifications?.forEach(
          async ({ id }) => {
            await Notifications.cancelScheduledNotificationAsync(id)
          }
        )
      }

      const scheduleNotifications = async () => {
        if (!conversation.followUp) {
          return []
        }

        const notificationChanged = !_.isEqual(
          conversationToUpdate?.followUp,
          conversation.followUp
        )

        if (notificationChanged) {
          cancelExistingNotification()
        }

        if (!conversation.followUp.notifyMe) {
          return []
        }

        const notifications: Notification[] = []

        const selectedDate = moment(conversation.followUp?.date)
          .subtract(notifyMeOffset.amount, notifyMeOffset.unit)
          .toDate()

        const getRandomEmoji = () => {
          const emojis = [
            '😀',
            '✨',
            '🚀',
            '⭐',
            '🎉',
            '💨',
            '👀',
            '💪',
            '⏱️',
            '🌟',
          ]
          const randomIndex = Math.floor(Math.random() * emojis.length)
          return emojis[randomIndex]
        }

        if (moment(selectedDate).isAfter(moment())) {
          try {
            const id = await Notifications.scheduleNotificationAsync({
              content: {
                title: i18n.t('reminder_title'),
                body: `${i18n.t('notification_part1')} ${
                  selectedContact!.name
                } ${i18n.t('notification_part2')} ${notifyMeOffset.amount} ${
                  notifyMeOffset.unit
                }. ${getRandomEmoji()}${
                  conversation.followUp.topic &&
                  `${i18n.t('reminder_topic')}${conversation.followUp.topic}`
                }`,
                sound: true,
              },
              trigger: {
                date: selectedDate,
              },
            })

            notifications.push({
              date: selectedDate,
              id,
            })
          } catch (error) {
            Sentry.captureException(error)
          }
        }

        return notifications
      }

      if (notificationsAllowed) {
        scheduleNotifications()
          .then((notifications) => {
            const conversationWithNotificationIds: Conversation = {
              ...conversation,
              followUp: {
                ...conversation.followUp!,
                notifications,
              },
            }
            params.conversationToEditId
              ? updateConversation(conversationWithNotificationIds)
              : addConversation(conversationWithNotificationIds)
            resolve(conversation)
          })
          .catch((error) => {
            Sentry.captureException(error)
            resolve(false)
          })
      } else {
        params.conversationToEditId
          ? updateConversation(conversation)
          : addConversation(conversation)
        resolve(conversation)
      }
      toast.show(i18n.t('success'), {
        message: i18n.t(
          conversation.notAtHome ? 'addedNotAtHome' : 'addedConversation'
        ),
        native: true,
      })
    })
  }, [
    addConversation,
    conversation,
    conversationToUpdate?.followUp,
    notificationsAllowed,
    notifyMeOffset.amount,
    notifyMeOffset.unit,
    params.conversationToEditId,
    selectedContact,
    toast,
    updateConversation,
  ])

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title=''
          buttonType='exit'
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
              {!params.contactId && (
                <Button
                  onPress={async () => {
                    navigation.popToTop()
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 12,
                    }}
                  >
                    {i18n.t('skip')}
                  </Text>
                </Button>
              )}
              {isEditing && (
                <IconButton
                  icon={faTrash}
                  color={theme.colors.text}
                  onPress={() =>
                    Alert.alert(
                      i18n.t('deleteConversation'),
                      i18n.t('deleteConversation_description'),
                      [
                        {
                          text: i18n.t('cancel'),
                          style: 'cancel',
                        },
                        {
                          text: i18n.t('delete'),
                          style: 'destructive',
                          onPress: () => {
                            deleteConversation(conversation.id)
                            toast.show(i18n.t('success'), {
                              message: i18n.t('deleted'),
                              native: true,
                            })
                            navigation.goBack()
                          },
                        },
                      ]
                    )
                  }
                />
              )}
              <Button
                onPress={async () => {
                  const succeeded = await submit()
                  if (!succeeded) {
                    // Failed validation if didn't submit
                    return
                  }

                  await maybeRequestStoreReview({
                    calledGoecodeApiTimes,
                    installedOn,
                    lastTimeRequestedAReview,
                    updateLastTimeRequestedStoreReview,
                  })

                  if (isEditing) {
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
    conversationToUpdate?.contact.id,
    deleteConversation,
    installedOn,
    isEditing,
    lastTimeRequestedAReview,
    navigation,
    params,
    submit,
    theme.colors.text,
    theme.colors.textInverse,
    toast,
    updateLastTimeRequestedStoreReview,
  ])

  const IsBibleStudyCheckbox = () => {
    const setIsBibleStudy = (isBibleStudy: boolean) => {
      setConversation({
        ...conversation,
        isBibleStudy,
      })
    }

    return (
      <Button
        style={{ flexDirection: 'row', gap: 10, marginLeft: 20 }}
        onPress={() => setIsBibleStudy(!conversation.isBibleStudy)}
      >
        <Checkbox
          value={conversation.isBibleStudy}
          onValueChange={(val) => setIsBibleStudy(val)}
        />
      </Button>
    )
  }

  const getTitle = () => {
    if (params?.conversationToEditId) {
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
      <Wrapper insets='none' style={{ gap: 30, marginTop: 20 }}>
        <View style={{ padding: 25, paddingBottom: 0, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton
              icon={conversation.notAtHome ? faCaravan : faComments}
              size={20}
              iconStyle={{ color: theme.colors.text }}
            />
            <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
              {getTitle()}
            </Text>
          </View>
          <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {notAtHome
              ? i18n.t('addNotAtHome_description')
              : i18n.t('addConversation_description')}
          </Text>
        </View>
        {selectedContact && <ContactRow selectedContact={selectedContact} />}
        <Divider borderStyle='dashed' />
        <Section>
          <InputRowContainer
            label={i18n.t('date')}
            justifyContent='space-between'
          >
            {Platform.OS === 'android' ? (
              <AndroidDateTimePicker
                maximumDate={moment().toDate()}
                value={conversation.date}
                onChange={handleDateChange}
                timeAndDate
              />
            ) : (
              <RNDateTimePicker
                locale={getLocales()[0].languageCode || undefined}
                maximumDate={moment().toDate()}
                value={conversation.date}
                onChange={handleDateChange}
                mode='datetime'
              />
            )}
          </InputRowContainer>
          <TextInputRow
            label={i18n.t('note')}
            textInputProps={{
              placeholder: i18n.t('note_placeholder'),
              multiline: true,
              defaultValue: conversation.note,
              textAlign: 'left',
              returnKeyType: 'default',
              onChangeText: (note: string) =>
                setConversation({ ...conversation, note }),
            }}
            lastInSection={notAtHome}
          />
          {!notAtHome && (
            <InputRowContainer
              label={i18n.t('conductedBibleStudy')}
              justifyContent='space-between'
              lastInSection
            >
              <IsBibleStudyCheckbox />
            </InputRowContainer>
          )}
        </Section>
        <Section>
          <InputRowContainer
            label={i18n.t('followUp')}
            justifyContent='space-between'
          >
            {Platform.OS === 'android' ? (
              <AndroidDateTimePicker
                minimumDate={moment().toDate()}
                value={conversation.followUp!.date}
                onChange={handleFollowUpDateChange}
                timeAndDate
              />
            ) : (
              <RNDateTimePicker
                locale={getLocales()[0].languageCode || undefined}
                mode='datetime'
                minimumDate={moment().toDate()}
                value={conversation.followUp!.date}
                onChange={handleFollowUpDateChange}
              />
            )}
          </InputRowContainer>
          <TextInputRow
            label={i18n.t('topic')}
            textInputProps={{
              placeholder: i18n.t('topic_placeholder'),
              defaultValue: conversation.followUp?.topic,
              returnKeyType: 'default',
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
          <NotificationSection
            conversation={conversation}
            notificationsAllowed={notificationsAllowed}
            notifyMeOffset={notifyMeOffset}
            setConversation={setConversation}
            setNotifyMeOffset={setNotifyMeOffset}
          />
        </Section>
      </Wrapper>
    </KeyboardAwareScrollView>
  )
}

export default ConversationFormScreen
