import React from 'react'
import { View, Alert } from 'react-native'
import { Sheet, XStack } from 'tamagui'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { Contact } from '../types/contact'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import Text from './MyText'
import IconButton from './IconButton'
import Button from './Button'
import useContacts from '../stores/contactsStore'
import { usePreferences } from '../stores/preferences'
import { useToastController } from '@tamagui/toast'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import * as Notifications from 'expo-notifications'
import * as Sentry from '@sentry/react-native'
import useNotifications from '../hooks/notifications'

export type DismissOption = {
  key: string
  duration: number
  unit: 'seconds' | 'minutes' | 'days' | 'weeks' | 'months' | 'years'
  label: string
  example: string
  isTestOption?: boolean
}

export const dismissOptions: DismissOption[] = [
  {
    key: '1_week',
    duration: 1,
    unit: 'weeks',
    label: 'dismissFor1Week',
    example: 'dismissExample',
  },
  {
    key: '1_month',
    duration: 1,
    unit: 'months',
    label: 'dismissFor1Month',
    example: 'dismissExample',
  },
  {
    key: '3_months',
    duration: 3,
    unit: 'months',
    label: 'dismissFor3Months',
    example: 'dismissExample',
  },
  {
    key: '6_months',
    duration: 6,
    unit: 'months',
    label: 'dismissFor6Months',
    example: 'dismissExample',
  },
  {
    key: '1_year',
    duration: 1,
    unit: 'years',
    label: 'dismissFor1Year',
    example: 'dismissExample',
  },
]

export const testDismissOptions: DismissOption[] = [
  {
    key: '10_seconds',
    duration: 10,
    unit: 'seconds',
    label: '10 Seconds',
    example: 'Until {date}',
    isTestOption: true,
  },
  {
    key: '1_minute',
    duration: 1,
    unit: 'minutes',
    label: '1 Minute',
    example: 'Until {date}',
    isTestOption: true,
  },
  {
    key: '5_minutes',
    duration: 5,
    unit: 'minutes',
    label: '5 Minutes',
    example: 'Until {date}',
    isTestOption: true,
  },
]

interface DismissContactSheetProps {
  open: boolean
  setOpen: (open: boolean) => void
  contact: Contact | null
}

const DismissContactSheet: React.FC<DismissContactSheetProps> = ({
  open,
  setOpen,
  contact,
}) => {
  const theme = useTheme()
  const { dismissContact } = useContacts()
  const { developerTools } = usePreferences()
  const toast = useToastController()
  const { allowed: notificationsAllowed } = useNotifications()
  const navigation = useNavigation()

  const handleDismiss = async (option: DismissOption) => {
    if (!contact) return

    const exampleFormat =
      option.unit === 'seconds' || option.unit === 'minutes'
        ? 'LTS'
        : 'MMM D, YYYY'
    const exampleDate = moment()
      .add(option.duration, option.unit)
      .format(exampleFormat)

    // Handle label and example text based on whether it's a test option
    const labelText = option.isTestOption
      ? option.label
      : i18n.t(option.label as 'dismissFor1Week')
    const exampleText = option.isTestOption
      ? option.example.replace('{date}', exampleDate)
      : i18n.t(option.example as 'dismissExample', { date: exampleDate })

    const dismissDescription = notificationsAllowed
      ? i18n.t('dismissContactDescriptionWithNotification', {
          name: contact.name,
          duration: labelText,
          example: exampleText,
        })
      : i18n.t('dismissContactDescription', {
          name: contact.name,
          duration: labelText,
          example: exampleText,
        })

    Alert.alert(i18n.t('dismissContact'), dismissDescription, [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
      },
      {
        text: i18n.t('dismiss'),
        onPress: async () => {
          const dismissedUntil = moment()
            .add(option.duration, option.unit)
            .toDate()

          let notificationId: string | undefined

          // Schedule notification if allowed
          if (
            notificationsAllowed &&
            moment(dismissedUntil).isAfter(moment())
          ) {
            try {
              const getRandomEmoji = () => {
                const emojis = [
                  '🔄',
                  '✨',
                  '👋',
                  '⭐',
                  '🎉',
                  '💫',
                  '👀',
                  '💪',
                  '⏱️',
                  '🌟',
                ]
                const randomIndex = Math.floor(Math.random() * emojis.length)
                return emojis[randomIndex]
              }

              notificationId = await Notifications.scheduleNotificationAsync({
                content: {
                  title: i18n.t('contactAvailableAgain'),
                  body: i18n.t('contactAvailableAgainMessage', {
                    name: contact.name,
                    emoji: getRandomEmoji(),
                  }),
                  sound: true,
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: dismissedUntil,
                },
              })
            } catch (error) {
              Sentry.captureException(error)
            }
          }

          // Use dismissContact function with notification ID
          dismissContact(contact.id, dismissedUntil, notificationId)

          setOpen(false)

          // Navigate back to close the ContactDetailsScreen
          navigation.goBack()

          const untilFormat =
            option.unit === 'seconds' || option.unit === 'minutes'
              ? 'LTS' // Time format like "3:45:20 PM"
              : 'MMM D, YYYY' // Date format like "Dec 25, 2024"

          const successMessage = notificationId
            ? i18n.t('contactDismissedWithNotificationMessage', {
                name: contact.name,
                until: moment(dismissedUntil).format(untilFormat),
              })
            : i18n.t('contactDismissedMessage', {
                name: contact.name,
                until: moment(dismissedUntil).format(untilFormat),
              })

          toast.show(i18n.t('contactDismissed'), {
            message: successMessage,
            native: true,
          })
        },
      },
    ])
  }

  return (
    <Sheet
      open={open}
      modal
      snapPoints={[80]}
      onOpenChange={setOpen}
      dismissOnSnapToBottom
      animation='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <XStack ai='center' jc='space-between' px={20} pt={20} pb={10}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('dismissForLater')}
          </Text>
          <IconButton
            onPress={() => setOpen(false)}
            size={20}
            icon={faTimes}
            color={theme.colors.text}
          />
        </XStack>

        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {contact && i18n.t('dismissContactHelp', { name: contact.name })}
          </Text>
        </View>

        <Sheet.ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 75 }}
        >
          <View style={{ gap: 10, paddingHorizontal: 20, paddingBottom: 30 }}>
            {developerTools && (
              <>
                <View style={{ marginBottom: 10 }}>
                  <Text
                    style={{
                      fontSize: theme.fontSize('xs'),
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                      textAlign: 'center',
                    }}
                  >
                    🧪 Developer Test Options
                  </Text>
                </View>
                {testDismissOptions.map((option) => {
                  const exampleDate = moment()
                    .add(option.duration, option.unit)
                    .format('LTS')

                  return (
                    <Button
                      key={option.key}
                      onPress={() => handleDismiss(option)}
                      style={{
                        paddingVertical: 16,
                        paddingHorizontal: 20,
                        borderRadius: theme.numbers.borderRadiusSm,
                        borderColor: theme.colors.accent,
                        borderWidth: 2,
                        backgroundColor: theme.colors.accentTranslucent,
                      }}
                    >
                      <View style={{ gap: 4 }}>
                        <Text
                          style={{
                            fontSize: theme.fontSize('md'),
                            fontFamily: theme.fonts.semiBold,
                            color: theme.colors.accent,
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: theme.fontSize('xs'),
                            color: theme.colors.textAlt,
                          }}
                        >
                          {option.example.replace('{date}', exampleDate)}
                        </Text>
                      </View>
                    </Button>
                  )
                })}
                <View style={{ height: 20 }} />
              </>
            )}
            {dismissOptions.map((option) => {
              const exampleDate = moment()
                .add(option.duration, option.unit)
                .format('MMM D, YYYY')

              return (
                <Button
                  key={option.key}
                  onPress={() => handleDismiss(option)}
                  style={{
                    paddingVertical: 16,
                    paddingHorizontal: 20,
                    borderRadius: theme.numbers.borderRadiusSm,
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                    backgroundColor: theme.colors.backgroundLighter,
                  }}
                >
                  <View style={{ gap: 4 }}>
                    <Text
                      style={{
                        fontSize: theme.fontSize('md'),
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.text,
                      }}
                    >
                      {option.isTestOption
                        ? option.label
                        : i18n.t(option.label as 'dismissFor1Week')}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {option.isTestOption
                        ? option.example.replace('{date}', exampleDate)
                        : i18n.t(option.example as 'dismissExample', {
                            date: exampleDate,
                          })}
                    </Text>
                  </View>
                </Button>
              )
            })}
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default DismissContactSheet
