import { useCallback } from 'react'
import { View, Platform } from 'react-native'
import Text from '../components/MyText'
import * as Notifications from 'expo-notifications'
import * as Crypto from 'expo-crypto'
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack'
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
import i18n from '../lib/locales'
import AndroidDateTimePicker from '../components/AndroidDateTimePicker'
import Checkbox from 'expo-checkbox'
import Select from '../components/Select'
import Wrapper from '../components/Wrapper'
import IconButton from '../components/IconButton'
import {
  faCaravan,
  faComments,
  faIdCard,
} from '@fortawesome/free-solid-svg-icons'
import _ from 'lodash'
import Button from '../components/Button'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation Form'>

const AssignmentSection = ({
  selectedContact,
  set_selectedContactId,
  navigation,
  errors,
}: {
  selectedContact: Contact | undefined
  set_selectedContactId: React.Dispatch<React.SetStateAction<string>>
  errors: Record<string, string>
  navigation: NativeStackNavigationProp<
    RootStackParamList,
    'Conversation Form',
    undefined
  >
}) => {
  const theme = useTheme()

  return (
    <Section>
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 15,
            paddingRight: 20,
            borderColor: theme.colors.error,
            borderWidth: errors['contact'] ? 1 : 0,
          }}
        >
          {selectedContact ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <IconButton icon={faIdCard} />
              <Text style={{ fontFamily: theme.fonts.semiBold, fontSize: 16 }}>
                {selectedContact.name}
              </Text>
            </View>
          ) : (
            <Text>{i18n.t('noContactAssigned')}</Text>
          )}
          <Button
            onPress={() =>
              selectedContact
                ? set_selectedContactId('')
                : navigation.navigate('Contact Selector')
            }
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {selectedContact ? i18n.t('unassign') : i18n.t('assign')}
            </Text>
          </Button>
        </View>
        {errors['contact'] && (
          <Text
            style={{
              textAlign: 'right',
              paddingRight: 20,
              color: theme.colors.error,
            }}
          >
            {errors['contact']}
          </Text>
        )}
      </View>
    </Section>
  )
}

const ConversationForm = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { params } = route
  const { contacts } = useContacts()
  const { conversations, addConversation, updateConversation } =
    useConversations()

  const conversationToEditViaProps = params.conversationToEditId
  const conversationToUpdate = conversationToEditViaProps
    ? [...conversations].find((c) => c.id === conversationToEditViaProps)
    : undefined

  const [assignedContactId, set_selectedContactId] = useState<string>(
    params.contactId || conversationToUpdate?.contact.id || ''
  )

  const notAtHome = params.notAtHome

  const [errors, setErrors] = useState<Record<string, string>>({
    contact: '',
  })

  const [notifyMeOffset, setNotifyMeOffset] = useState<{
    amount?: number
    unit?: moment.unitOfTime.DurationConstructor | undefined
  }>({
    amount: 2,
    unit: 'hours',
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
        id: assignedContactId || '',
      },
      date: new Date(),
      note: '',
      followUp: {
        date: new Date(),
        topic: '',
        notifyMe: false,
      },
      isBibleStudy: false,
      notAtHome: params.notAtHome,
    }
  }

  const [conversation, setConversation] = useState<Conversation>(
    getConversationDefaultValue()
  )

  const setNotifyMe = (notifyMe: boolean) => {
    setConversation({
      ...conversation,
      followUp: {
        ...conversation.followUp!,
        notifyMe,
      },
    })
  }

  const selectedContact = contacts.find((c) => c.id === assignedContactId)
  const [notificationsAllowed, setNotificationsAllowed] =
    useState<boolean>(false)

  useEffect(() => {
    const fetchNotificationsSetting = async () => {
      const { granted } = await Notifications.getPermissionsAsync()
      setNotificationsAllowed(granted)
    }
    fetchNotificationsSetting()
  }, [])

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

  const validate = useCallback((): boolean => {
    if (!conversation.contact.id) {
      setErrors({ contact: i18n.t('youMustAssignAConversationToContact') })
      return false
    }
    if (conversation.contact.id) {
      setErrors({ contact: '' })
    }
    return true
  }, [conversation])

  const submit = useCallback(() => {
    return new Promise((resolve) => {
      const passValidation = validate()
      if (!passValidation) {
        return resolve(false)
      }

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
            console.error(error)
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
            console.error(error)
            resolve(false)
          })
      } else {
        params.conversationToEditId
          ? updateConversation(conversation)
          : addConversation(conversation)
        resolve(conversation)
      }
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
    updateConversation,
    validate,
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
              <Button
                onPress={async () => {
                  const succeeded = await submit()
                  if (!succeeded) {
                    // Failed validation if didn't submit
                    return
                  }
                  if (params.contactId || conversationToUpdate?.contact.id) {
                    navigation.replace('Contact Details', {
                      id: params.contactId || conversationToUpdate?.contact.id,
                    })
                    return
                  }
                  navigation.popToTop()
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    textDecorationLine: 'underline',
                    fontSize: 16,
                  }}
                >
                  {conversationToUpdate?.contact.id
                    ? i18n.t('save')
                    : i18n.t('add')}
                </Text>
              </Button>
            </View>
          }
        />
      ),
    })
  }, [
    conversationToUpdate?.contact.id,
    navigation,
    params,
    submit,
    theme.colors.text,
    theme.colors.textInverse,
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

  const amountOptions = [...Array(1000).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))
  const unitOptions: {
    label: string
    value: moment.unitOfTime.DurationConstructor
  }[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
    label: i18n.t(`${value}_lowercase`),
    value: value as moment.unitOfTime.DurationConstructor,
  }))

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
      <Wrapper noInsets style={{ gap: 30, marginTop: 20 }}>
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
        <AssignmentSection
          errors={errors}
          navigation={navigation}
          selectedContact={selectedContact}
          set_selectedContactId={set_selectedContactId}
        />
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
              <View
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
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
            </View>
          </InputRowContainer>
        </Section>
      </Wrapper>
    </KeyboardAwareScrollView>
  )
}

export default ConversationForm
