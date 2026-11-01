import { useState } from 'react'
import { Pressable, View } from 'react-native'
import PointerHover from '@/components/ui/PointerHover'
import SwipeableRow from '@/components/ui/SwipeableRow'
import RichNote from '@/components/RichNote'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import useVisitMenuActions from '@/hooks/useVisitMenuActions'
import { activeCustomFieldDefs } from '@/lib/customFields'
import { formatTime } from '@/lib/dates'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc, getNoteText, hasNote } from '@/lib/richText/notes'
import useConversations from '@/stores/conversationStore'
import { Visit } from '@/types/visit'
import { visitCardAccessibilityLabel } from '@/features/contacts/lib/visitCardLabel'
import { visitDayLabel } from '@/features/contacts/lib/visitDates'
import { visitOutcome } from '@/features/contacts/lib/visitTimeline'

const NOTE_LINES = 3

const VisitTimelineCard = ({
  visit,
  highlighted,
}: {
  visit: Visit
  highlighted: boolean
}) => {
  const theme = useTheme()

  const showMorePadding = (MIN_TOUCH_TARGET - theme.fontSize('sm')) / 2
  const { open, requestDelete, menu } = useVisitMenuActions(visit)
  const [expanded, setExpanded] = useState(false)
  const [truncates, setTruncates] = useState(false)
  const updateConversation = useConversations((s) => s.updateConversation)
  const showsNote = hasNote(visit)

  const hasPhotos = richTextImages(getNoteDoc(visit)).length > 0
  const canExpand = showsNote && (truncates || hasPhotos || expanded)
  const dayLabel = visitDayLabel(visit.date)

  const largeText = useAccessibilityTextSize()
  const fields = activeCustomFieldDefs(
    useConversations((state) => state.conversationFieldDefs)
  ).flatMap((def) => {
    const value = visit.customFields?.[def.id]?.trim()
    return value ? [{ id: def.id, label: def.label, value }] : []
  })

  const noteStyle = { fontSize: theme.fontSize('sm') + 1, lineHeight: 19 }

  return (
    <SwipeableRow
      onSwipeableWillOpen={() => Haptics.light()}
      renderTrailingActions={() => <SwipeableDelete />}
      onSwipeableOpen={(side, swipeable) => {
        if (side !== 'trailing') return
        swipeable.reset()
        requestDelete()
      }}
      containerStyle={{ borderRadius: theme.numbers.borderRadiusLg }}
    >
      <ContextMenu
        onPress={open}
        hoverRadius={theme.numbers.borderRadiusLg}
        accessibilityLabel={visitCardAccessibilityLabel({
          day: dayLabel,
          time: formatTime(visit.date),
          outcome: visitOutcome(visit),
          note: getNoteText(visit),
          fields,
        })}
        accessible={!canExpand}
        actions={menu}
      >
        <View
          testID={`visit-card-${visit.id}`}
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
              flexWrap: largeText ? 'wrap' : 'nowrap',
              gap: 9,
            }}
          >
            <Text
              numberOfLines={largeText ? undefined : 1}
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
          {showsNote ? (
            <View style={{ gap: 4 }}>
              {expanded ? (
                <RichNote
                  note={visit}
                  nested
                  style={noteStyle}
                  onChange={(fields) =>
                    updateConversation({ ...visit, ...fields })
                  }
                />
              ) : (
                <>
                  {}
                  <View
                    aria-hidden
                    pointerEvents='none'
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      opacity: 0,
                    }}
                  >
                    <RichNote
                      note={visit}
                      preview
                      interactive={false}
                      style={noteStyle}
                      onTextLayout={(e) =>
                        setTruncates(e.nativeEvent.lines.length > NOTE_LINES)
                      }
                    />
                  </View>
                  <RichNote
                    note={visit}
                    numberOfLines={NOTE_LINES}
                    interactive={false}
                    style={noteStyle}
                  />
                </>
              )}
              {canExpand && (
                <PointerHover effect='highlight'>
                  {}
                  <Pressable
                    onPress={() => setExpanded((value) => !value)}
                    accessibilityRole='button'
                    style={{
                      alignSelf: 'flex-start',
                      paddingVertical: showMorePadding,
                      marginVertical: -showMorePadding,
                    }}
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
                </PointerHover>
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
    </SwipeableRow>
  )
}

export default VisitTimelineCard
