import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import ContextMenu from '@/components/ui/ContextMenu'
import { useCopyAction } from '@/components/ui/Copyeable'
import Text from '@/components/ui/MyText'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import useTheme from '@/contexts/theme'

import confirmDestructive from '@/lib/confirmDestructive'
import { isAppointment } from '@/lib/conversations'
import { activeCustomFieldDefs } from '@/lib/customFields'
import { formatTime } from '@/lib/dates'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { RootStackNavigation } from '@/types/rootStack'
import { Visit } from '@/types/visit'
import { visitDayLabel } from '@/features/contacts/lib/visitDates'
import { visibleNote } from '@/features/contacts/lib/visitTimeline'

const NOTE_LINES = 3

/**
 * One visit on the rail. Tap edits; swipe left deletes; long-press offers Edit,
 * Reschedule Follow-Up, Copy Note / Topic, and Delete.
 */
const VisitTimelineCard = ({
  visit,
  highlighted,
}: {
  visit: Visit
  highlighted: boolean
}) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()
  const { deleteConversation } = useConversations()
  const [expanded, setExpanded] = useState(false)
  const [truncates, setTruncates] = useState(false)
  const copyAction = useCopyAction()
  const note = visibleNote(visit.note)
  const topic = visit.followUp?.topic?.trim() ?? ''
  const dayLabel = visitDayLabel(visit.date)
  const fields = activeCustomFieldDefs(
    useConversations((state) => state.conversationFieldDefs)
  ).flatMap((def) => {
    const value = visit.customFields?.[def.id]?.trim()
    return value ? [{ id: def.id, label: def.label, value }] : []
  })

  const edit = () =>
    navigation.navigate('Visit Form', {
      contactId: visit.contact.id,
      visitToEditId: visit.id,
      notAtHome: visit.notAtHome,
    })

  const requestDelete = () =>
    confirmDestructive({
      title: i18n.t('deleteConversation'),
      description: i18n.t('deleteConversation_description'),
      onConfirm: () => {
        deleteConversation(visit.id)

        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
      },
    })

  return (
    <Swipeable
      onSwipeableWillOpen={() => Haptics.light()}
      renderRightActions={() => <SwipeableDelete />}
      onSwipeableOpen={(direction, swipeable) => {
        if (direction !== 'right') return
        swipeable.reset()
        requestDelete()
      }}
      containerStyle={{ borderRadius: theme.numbers.borderRadiusLg }}
    >
      <ContextMenu
        onPress={edit}
        hoverRadius={theme.numbers.borderRadiusLg}
        accessibilityLabel={dayLabel}
        // Keep Show more / Show less reachable by screen readers.
        accessible={!(truncates || expanded)}
        actions={[
          [
            {
              id: 'edit',
              title: i18n.t('edit'),
              systemImage: 'pencil',
              onPress: edit,
            },
            isAppointment(visit) && {
              id: 'reschedule_follow_up',
              title: i18n.t('rescheduleFollowUp'),
              systemImage: 'calendar.badge.clock',
              onPress: () =>
                navigation.navigate('RescheduleVisit', {
                  contactId: visit.contact.id,
                  visitId: visit.id,
                }),
            },
            !!note &&
              copyAction(note, { id: 'copy_note', title: i18n.t('copyNote') }),
            !!topic &&
              copyAction(topic, {
                id: 'copy_topic',
                title: i18n.t('copyTopic'),
              }),
          ],
          [
            {
              id: 'delete',
              title: i18n.t('delete'),
              systemImage: 'trash',
              destructive: true,
              onPress: requestDelete,
            },
          ],
        ]}
      >
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.numbers.borderRadiusLg,
            paddingVertical: 14,
            paddingHorizontal: 15,
            gap: 8,
            borderWidth: highlighted ? 1.5 : 0,
            borderColor: theme.colors.accent,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 9,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {dayLabel}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm') + 0.5,
                color: theme.colors.textAlt,
              }}
            >
              {formatTime(visit.date)}
            </Text>
          </View>
          {note ? (
            <View style={{ gap: 4 }}>
              {/* Invisible unclamped copy: iOS only reports the visible lines
                of a clamped Text, so measure the full note here instead. */}
              <Text
                aria-hidden
                pointerEvents='none'
                onTextLayout={(e) =>
                  setTruncates(e.nativeEvent.lines.length > NOTE_LINES)
                }
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  opacity: 0,
                  fontSize: theme.fontSize('sm') + 1,
                  lineHeight: 19,
                }}
              >
                {note}
              </Text>
              <Text
                numberOfLines={expanded ? undefined : NOTE_LINES}
                style={{
                  fontSize: theme.fontSize('sm') + 1,
                  lineHeight: 19,
                }}
              >
                {note}
              </Text>
              {(truncates || expanded) && (
                <Pressable
                  onPress={() => setExpanded((value) => !value)}
                  hitSlop={8}
                  accessibilityRole='button'
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.accent,
                    }}
                  >
                    {expanded
                      ? i18n.t('contactDetails.showLess')
                      : i18n.t('contactDetails.showMore')}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : visit.notAtHome ? (
            <Text
              style={{
                fontSize: theme.fontSize('sm') + 1,
                fontStyle: 'italic',
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('contactDetails.noOneAnswered')}
            </Text>
          ) : null}
          {fields.length > 0 && (
            <View style={{ gap: 2 }}>
              {fields.map((field) => (
                <Text
                  key={field.id}
                  style={{ fontSize: theme.fontSize('sm') + 0.5 }}
                >
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                    }}
                  >
                    {`${i18n.t('customFieldLabel', { label: field.label })} `}
                  </Text>
                  {field.value}
                </Text>
              ))}
            </View>
          )}
        </View>
      </ContextMenu>
    </Swipeable>
  )
}

export default VisitTimelineCard
