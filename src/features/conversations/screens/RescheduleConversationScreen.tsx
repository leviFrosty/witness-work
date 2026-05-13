import React, { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import moment from 'moment'
import * as Notifications from 'expo-notifications'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import {
  faPhone,
  faComment,
  faPenToSquare,
  faCalendarDay,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'

import Wrapper from '@/components/layout/Wrapper'
import Text from '@/components/MyText'
import Button from '@/components/Button'
import IconButton from '@/components/IconButton'
import DateTimePicker from '@/components/DateTimePicker'

import useTheme from '@/contexts/theme'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import { handleCall, handleMessage } from '@/lib/phone'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { RootStackParamList, RootStackNavigation } from '@/types/rootStack'
import { Notification as ConvNotification } from '@/types/conversation'

type Props = NativeStackScreenProps<
  RootStackParamList,
  'RescheduleConversation'
>

/**
 * Outlined icon-only button used for the contact card's call/text quick
 * actions. Deliberately low-priority (no fill, subdued border) so it doesn't
 * compete with the primary Reschedule CTA below.
 */
const QuickActionIconButton = ({
  icon,
  onPress,
}: {
  icon: typeof faPhone
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconButton icon={icon} iconStyle={{ color: theme.colors.textAlt }} />
    </Button>
  )
}

/**
 * Parallel card used for the two mutually-exclusive actions on this screen
 * (reschedule the follow-up vs log a new conversation). The primary variant
 * uses a filled accent CTA; the secondary variant uses an outlined CTA so the
 * visual weight matches the semantic hierarchy — "Reschedule" is the default
 * path for this screen, "Log visit" is the alternate.
 */
const ChoiceCard = ({
  icon,
  title,
  description,
  ctaLabel,
  onCta,
  variant = 'primary',
  children,
}: {
  icon: typeof faPhone
  title: string
  description: string
  ctaLabel: string
  onCta: () => void
  variant?: 'primary' | 'secondary'
  children?: React.ReactNode
}) => {
  const theme = useTheme()
  const isPrimary = variant === 'primary'
  return (
    <View
      style={{
        backgroundColor: theme.colors.backgroundLighter,
        borderRadius: theme.numbers.borderRadiusLg,
        padding: 20,
        gap: 14,
      }}
    >
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon={icon} iconStyle={{ color: theme.colors.accent }} />
          <Text
            style={{
              fontSize: 15,
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {title}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.textAlt,
          }}
        >
          {description}
        </Text>
      </View>
      {children}
      <Button
        onPress={onCta}
        style={{
          backgroundColor: isPrimary ? theme.colors.accent : 'transparent',
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: isPrimary ? 0 : 1,
          borderColor: theme.colors.border,
          paddingVertical: 14,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: isPrimary ? theme.colors.textInverse : theme.colors.text,
            fontFamily: theme.fonts.bold,
          }}
        >
          {ctaLabel}
        </Text>
      </Button>
    </View>
  )
}

/**
 * "— or —" divider between the two ChoiceCards. Sits between primary and
 * secondary actions to reinforce the either/or relationship without the heavier
 * connector tree that previously wrapped this section.
 */
const OrDivider = () => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginVertical: 10,
      }}
    >
      <View
        style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }}
      />
      <Text
        style={{
          fontSize: 11,
          fontFamily: theme.fonts.bold,
          color: theme.colors.textAlt,
          letterSpacing: 1,
        }}
      >
        {i18n.t('or').toUpperCase()}
      </Text>
      <View
        style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }}
      />
    </View>
  )
}

/**
 * One-tap shortcut for the most common reschedule destinations. The inline
 * datetime picker below is always available as the "custom" escape hatch, so
 * the chips deliberately don't include a Custom option.
 */
const QuickDateChips = ({
  value,
  onPick,
}: {
  value: Date
  onPick: (d: Date) => void
}) => {
  const theme = useTheme()
  // Chips shift the day relative to *now* (not the original missed date) so
  // the labels always match reality — "Tomorrow" actually means tomorrow.
  // They carry the currently-picked time forward so the user doesn't have to
  // re-enter it after adjusting with the picker.
  const options = useMemo(() => {
    const h = value.getHours()
    const m = value.getMinutes()
    const s = value.getSeconds()
    const ms = value.getMilliseconds()
    const withCurrentTime = (base: moment.Moment) =>
      base.hours(h).minutes(m).seconds(s).milliseconds(ms).toDate()
    return [
      {
        key: 'tomorrow',
        label: i18n.t('tomorrow'),
        date: withCurrentTime(moment().add(1, 'day')),
      },
      {
        key: 'plus3',
        label: i18n.t('plusDays', { count: 3 }),
        date: withCurrentTime(moment().add(3, 'days')),
      },
      {
        key: 'nextWeek',
        label: i18n.t('nextWeek'),
        date: withCurrentTime(moment().add(1, 'week')),
      },
    ]
  }, [value])

  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const active = moment(value).isSame(opt.date, 'minute')
        return (
          <Button
            key={opt.key}
            onPress={() => onPick(opt.date)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : theme.colors.border,
              backgroundColor: active
                ? theme.colors.accentTranslucent
                : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.semiBold,
                color: active ? theme.colors.accent : theme.colors.text,
              }}
            >
              {opt.label}
            </Text>
          </Button>
        )
      })}
    </View>
  )
}

/**
 * Reschedule sheet — surfaces from the Appointments widget and home-screen
 * "Missed Conversations" card for overdue follow-ups. The intent is "I missed
 * this — what now?", so the layout groups all contact-related info into one
 * card at the top (with the user's previous note for quick context), and offers
 * two mutually exclusive paths: reschedule (primary) or log the visit that
 * already happened (secondary). "Dismiss follow-up" is a low-priority iconified
 * text button at the bottom since it's destructive and rarely the intended
 * action.
 */
const RescheduleConversationScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { conversationId, contactId } = route.params
  const { contacts } = useContacts()
  const { conversations, updateConversation } = useConversations()
  const { returnVisitNotificationOffset } = usePreferences()

  const contact = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contacts, contactId]
  )
  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  )

  // Default the picker to "tomorrow at the original time" so the user can
  // accept the easiest possible reschedule with one tap. Anchored to now (not
  // the original missed date) so the new date is always in the future — for
  // an overdue follow-up, "original + 1 day" can still be in the past.
  const originalDate = conversation?.followUp?.date
    ? new Date(conversation.followUp.date)
    : new Date()
  const [newDate, setNewDate] = useState(() =>
    moment()
      .add(1, 'day')
      .hours(originalDate.getHours())
      .minutes(originalDate.getMinutes())
      .seconds(0)
      .milliseconds(0)
      .toDate()
  )

  const phoneFormatted = useMemo(() => {
    if (!contact?.phone) return null
    return parsePhoneNumber(contact.phone, {
      regionCode: contact.phoneRegionCode || getLocales()[0]?.regionCode || '',
    })
  }, [contact?.phone, contact?.phoneRegionCode])

  const dismiss = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack()
  }, [navigation])

  const handleReschedule = useCallback(async () => {
    if (!conversation) return

    // Cancel any existing follow-up notifications. We always rebuild from
    // scratch so a stale reminder can't fire after rescheduling.
    await Promise.all(
      (conversation.followUp?.notifications ?? []).map(async ({ id }) => {
        try {
          await Notifications.cancelScheduledNotificationAsync(id)
        } catch (e) {
          logger.error('[reschedule] failed to cancel notification', e)
        }
      })
    )

    // If the user had notifications enabled and the new date is still in
    // the future, schedule a fresh notification using the same offset.
    const notifications: ConvNotification[] = []
    if (conversation.followUp?.notifyMe) {
      const offsetAmount =
        returnVisitNotificationOffset?.amount ??
        DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET.amount
      const offsetUnit =
        returnVisitNotificationOffset?.unit ??
        DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET.unit
      const fireAt = moment(newDate).subtract(offsetAmount, offsetUnit).toDate()

      if (moment(fireAt).isAfter(moment())) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: i18n.t('reminder_title'),
              body: `${i18n.t('notification_part1')} ${
                contact?.name ?? ''
              } ${i18n.t('notification_part2')} ${offsetAmount} ${offsetUnit}.`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: fireAt,
            },
          })
          notifications.push({ date: fireAt, id })
        } catch (e) {
          logger.error('[reschedule] failed to schedule notification', e)
        }
      }
    }

    updateConversation({
      ...conversation,
      followUp: {
        ...conversation.followUp!,
        date: newDate,
        notifications,
        // Rescheduling re-activates a previously dismissed follow-up — the
        // user has explicitly committed to a new date, so the dismissal no
        // longer applies.
        dismissed: false,
      },
    })

    dismiss()
  }, [
    conversation,
    contact?.name,
    newDate,
    returnVisitNotificationOffset,
    updateConversation,
    dismiss,
  ])

  const handleDismissFollowUp = useCallback(() => {
    if (!conversation) return
    Alert.alert(
      i18n.t('dismissFollowUpConfirmTitle'),
      i18n.t('dismissFollowUpConfirmDesc'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('dismiss'),
          style: 'destructive',
          onPress: async () => {
            await Promise.all(
              (conversation.followUp?.notifications ?? []).map(
                async ({ id }) => {
                  try {
                    await Notifications.cancelScheduledNotificationAsync(id)
                  } catch (e) {
                    logger.error(
                      '[reschedule] failed to cancel notification',
                      e
                    )
                  }
                }
              )
            )
            // Mark dismissed instead of nuking the followUp object — we want
            // to preserve the user's topic/date/note context for history.
            // Notifications are still cancelled above so a stale reminder
            // can't fire after dismissal.
            updateConversation({
              ...conversation,
              followUp: {
                ...conversation.followUp!,
                notifications: [],
                dismissed: true,
              },
            })
            dismiss()
          },
        },
      ]
    )
  }, [conversation, updateConversation, dismiss])

  const handleAddConversation = useCallback(() => {
    if (!contact) return
    // Not marking the original follow-up complete — this opens Add
    // Conversation prefilled so the user can log the actual conversation
    // they had (or will have). The original follow-up stays attached to
    // the prior conversation until the user explicitly reschedules it.
    dismiss()
    ;(navigation as unknown as RootStackNavigation).navigate(
      'Conversation Form',
      { contactId: contact.id }
    )
  }, [contact, dismiss, navigation])

  const openContactDetails = useCallback(() => {
    if (!contact) return
    ;(navigation as unknown as RootStackNavigation).navigate(
      'Contact Details',
      { id: contact.id }
    )
  }, [contact, navigation])

  if (!conversation || !contact) {
    return (
      <Wrapper insets='bottom'>
        <View style={{ padding: 20 }}>
          <Text>{i18n.t('contactNotFoundForId')}</Text>
          <Button onPress={dismiss}>
            <Text style={{ color: theme.colors.accent }}>
              {i18n.t('cancel')}
            </Text>
          </Button>
        </View>
      </Wrapper>
    )
  }

  // moment's fromNow(true) returns "5 hours" / "2 days" without the trailing
  // "ago", letting us compose a localized "{time} overdue" label that's more
  // scannable than the absolute timestamp alone.
  const overdueLabel = i18n.t('overdueBy', {
    time: moment(originalDate).fromNow(true),
  })

  return (
    <Wrapper insets='bottom'>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 20,
          gap: 20,
        }}
      >
        {/* Contact card — tappable to open full contact details. Shows a
            tinted OVERDUE pill with relative time, the name, the user's
            previous note (so they can pick up the thread before reaching
            out), the follow-up topic, and quick call/text actions. */}
        <Pressable
          onPress={openContactDetails}
          style={{
            backgroundColor: theme.colors.backgroundLighter,
            borderRadius: theme.numbers.borderRadiusLg,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: theme.colors.warnTranslucent,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.warn,
                  letterSpacing: 1,
                }}
              >
                {overdueLabel.toUpperCase()}
              </Text>
            </View>
            <Text
              style={{ fontSize: 22, fontFamily: theme.fonts.bold }}
              numberOfLines={1}
            >
              {contact.name}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {moment(originalDate).format('LLL')}
            </Text>
            {conversation.note ? (
              <View style={{ marginTop: 8, gap: 2 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: theme.fonts.bold,
                    color: theme.colors.textAlt,
                    letterSpacing: 1,
                  }}
                >
                  {i18n.t('youLastWrote').toUpperCase()}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.text,
                    fontStyle: 'italic',
                  }}
                  numberOfLines={3}
                >
                  {`"${conversation.note}"`}
                </Text>
              </View>
            ) : null}
            {conversation.followUp?.topic ? (
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.text,
                  marginTop: 6,
                }}
                numberOfLines={3}
              >
                {conversation.followUp.topic}
              </Text>
            ) : null}
          </View>

          {phoneFormatted?.valid ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <QuickActionIconButton
                icon={faPhone}
                onPress={() =>
                  handleCall(
                    contact,
                    phoneFormatted,
                    navigation as unknown as RootStackNavigation
                  )
                }
              />
              <QuickActionIconButton
                icon={faComment}
                onPress={() =>
                  handleMessage(
                    contact,
                    phoneFormatted,
                    navigation as unknown as RootStackNavigation
                  )
                }
              />
            </View>
          ) : null}
        </Pressable>

        {/* Two mutually-exclusive paths. Primary (reschedule) is filled,
            secondary (log the visit that already happened) is outlined. */}
        <View>
          <ChoiceCard
            icon={faCalendarDay}
            title={i18n.t('pickNewDate')}
            description={i18n.t('rescheduleDescription')}
            ctaLabel={i18n.t('reschedule')}
            onCta={handleReschedule}
          >
            <QuickDateChips value={newDate} onPick={setNewDate} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
            >
              <DateTimePicker
                value={newDate}
                onChange={(_e, picked) => picked && setNewDate(picked)}
                iOSMode='datetime'
              />
            </View>
          </ChoiceCard>

          <OrDivider />

          <ChoiceCard
            icon={faPenToSquare}
            title={i18n.t('alreadyHadVisit')}
            description={i18n.t('alreadyHadVisitDescription')}
            ctaLabel={i18n.t('logVisit')}
            onCta={handleAddConversation}
            variant='secondary'
          />
        </View>

        <Button
          onPress={handleDismissFollowUp}
          style={{
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
          }}
        >
          <IconButton
            icon={faTrash}
            size={12}
            iconStyle={{ color: theme.colors.textAlt }}
          />
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: 13,
            }}
          >
            {i18n.t('dismissFollowUp')}
          </Text>
        </Button>
      </View>
    </Wrapper>
  )
}

export default RescheduleConversationScreen
