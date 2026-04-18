import React, { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
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
} from '@fortawesome/free-solid-svg-icons'

import Wrapper from '../components/layout/Wrapper'
import Text from '../components/MyText'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import DateTimePicker from '../components/DateTimePicker'

import useTheme from '../contexts/theme'
import useContacts from '../stores/contactsStore'
import useConversations from '../stores/conversationStore'
import { usePreferences } from '../stores/preferences'
import { handleCall, handleMessage } from '../lib/phone'
import i18n from '../lib/locales'
import { logger } from '../lib/logger'
import { RootStackParamList, RootStackNavigation } from '../types/rootStack'
import { Notification as ConvNotification } from '../types/conversation'

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
 * (reschedule the follow-up vs log a new conversation). Both cards share the
 * same structure — icon+title header, short description, optional body content,
 * primary CTA — so the user reads them as alternatives rather than as a list of
 * steps.
 */
const ChoiceCard = ({
  icon,
  title,
  description,
  ctaLabel,
  onCta,
  children,
}: {
  icon: typeof faPhone
  title: string
  description: string
  ctaLabel: string
  onCta: () => void
  children?: React.ReactNode
}) => {
  const theme = useTheme()
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
            fontSize: 12,
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
          backgroundColor: theme.colors.accent,
          borderRadius: theme.numbers.borderRadiusSm,
          paddingVertical: 14,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: theme.colors.textInverse,
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
 * "— or —" divider between the ChoiceCards inside the tree. Lives entirely
 * inside the right-hand (cards) column so its hairlines don't collide with the
 * vertical trunk on the left.
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
 * Tree wrapper for the ChoiceCards. Draws a vertical trunk on the left that
 * visually roots both options in the contact card above, plus a short
 * horizontal stub from the trunk to each card's header. An OR divider is
 * interleaved between items to reinforce the either/or relationship.
 *
 * The trunk is absolutely positioned so its top edge can extend up past the
 * wrapper into the gap above (bridging into the contact card) and its bottom
 * edge can stop at the last card's stub, regardless of dynamic card heights.
 * The last card's height is measured via `onLayout`.
 */
const ChoicesTree = ({
  items,
}: {
  items: { key: string; card: React.ReactNode }[]
}) => {
  const theme = useTheme()
  // Where the horizontal stub sits from the top of each card — roughly the
  // vertical center of the card's icon+title header. Fixed offset is fine
  // because the ChoiceCard header is a single row with consistent height.
  const STUB_Y = 34
  const TRUNK_X = 10
  const STUB_LENGTH = 14
  // How far the trunk reaches up past the tree wrapper so it visually
  // touches the contact card directly above. Must match the parent
  // container's `gap` between the contact card and this tree.
  const REACH_UP = 20

  const [lastCardHeight, setLastCardHeight] = useState(0)

  return (
    <View style={{ flexDirection: 'row', position: 'relative' }}>
      {/* Vertical trunk — absolutely positioned so top can extend up into
          the contact card's area and bottom can land exactly at the last
          card's stub. */}
      <View
        style={{
          position: 'absolute',
          left: TRUNK_X,
          top: -REACH_UP,
          bottom: Math.max(lastCardHeight - STUB_Y, 0),
          width: 2,
          backgroundColor: theme.colors.border,
        }}
      />

      {/* Left spacer column — reserves room so the card column starts to the
          right of the trunk + its horizontal stubs. */}
      <View style={{ width: TRUNK_X + 2 + STUB_LENGTH }} />

      {/* Right column: cards separated by an OR divider. Each card has a
          short horizontal stub reaching back to the trunk. */}
      <View style={{ flex: 1 }}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <React.Fragment key={item.key}>
              <View
                style={{ position: 'relative' }}
                onLayout={
                  isLast
                    ? (e) => setLastCardHeight(e.nativeEvent.layout.height)
                    : undefined
                }
              >
                <View
                  style={{
                    position: 'absolute',
                    left: -STUB_LENGTH,
                    top: STUB_Y,
                    width: STUB_LENGTH,
                    height: 2,
                    backgroundColor: theme.colors.border,
                  }}
                />
                {item.card}
              </View>
              {!isLast ? <OrDivider /> : null}
            </React.Fragment>
          )
        })}
      </View>
    </View>
  )
}

/**
 * Reschedule sheet — surfaces from the Appointments widget and home-screen
 * "Missed Conversations" card for overdue follow-ups. The intent is "I missed
 * this — what now?", so the layout groups all contact-related info and quick
 * actions into one card at the top, and all reschedule-related controls into
 * one card below:
 *
 * Contact card: OVERDUE pill, name, original date, topic, Call/Text quick
 * actions — everything you need to contact the person to apologize, reach out,
 * or check in. Reschedule: date/time picker + primary "Reschedule" CTA in the
 * same card so the picker visibly owns the action. Add: secondary "Add
 * conversation" button (not "mark complete" — it's not marking anything, it
 * opens the conversation form prefilled for this contact so the user can log
 * the actual conversation). Cancel: dismiss without changes.
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
  // accept the easiest possible reschedule with one tap.
  const originalDate = conversation?.followUp?.date
    ? new Date(conversation.followUp.date)
    : new Date()
  const [newDate, setNewDate] = useState(() =>
    moment(originalDate).add(1, 'day').toDate()
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
      const offsetAmount = returnVisitNotificationOffset?.amount ?? 2
      const offsetUnit = returnVisitNotificationOffset?.unit ?? 'hours'
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
        {/* Contact card — who this is, with low-priority icon-only call/text
            quick actions in the top-right corner so they don't compete with
            the main Reschedule CTA below. */}
        <View
          style={{
            backgroundColor: theme.colors.backgroundLighter,
            borderRadius: theme.numbers.borderRadiusLg,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: theme.fonts.bold,
                color: theme.colors.warn,
                letterSpacing: 1,
              }}
            >
              {i18n.t('overdue').toUpperCase()}
            </Text>
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
            {conversation.followUp?.topic ? (
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.text,
                  marginTop: 4,
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
        </View>

        {/* Two mutually-exclusive paths — either reschedule the existing
            follow-up, or log a new visit. Wrapped in a tree connector that
            visually roots both options in the contact card above, so they
            read as alternatives stemming from the same parent. */}
        <ChoicesTree
          items={[
            {
              key: 'reschedule',
              card: (
                <ChoiceCard
                  icon={faCalendarDay}
                  title={i18n.t('reschedule')}
                  description={i18n.t('rescheduleDescription')}
                  ctaLabel={i18n.t('reschedule')}
                  onCta={handleReschedule}
                >
                  <View
                    style={{
                      backgroundColor: theme.colors.background,
                      borderRadius: theme.numbers.borderRadiusSm,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <DateTimePicker
                      value={newDate}
                      onChange={(_e, picked) => picked && setNewDate(picked)}
                      iOSMode='datetime'
                    />
                  </View>
                </ChoiceCard>
              ),
            },
            {
              key: 'add',
              card: (
                <ChoiceCard
                  icon={faPenToSquare}
                  title={i18n.t('newConversation')}
                  description={i18n.t('addConversationShortDescription')}
                  ctaLabel={i18n.t('addConversation')}
                  onCta={handleAddConversation}
                />
              ),
            },
          ]}
        />
      </View>
    </Wrapper>
  )
}

export default RescheduleConversationScreen
