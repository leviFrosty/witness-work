import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  BookOpen as BookOpenIcon,
  Caravan as CaravanIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import { Visit } from '@/types/visit'
import moment from 'moment'
import { formatTime } from '@/lib/dates'
import useTheme from '@/contexts/theme'
import useConversations from '@/stores/conversationStore'
import i18n from '@/lib/locales'
import { useNavigation } from '@react-navigation/native'
import { Swipeable } from 'react-native-gesture-handler'
import Badge from '@/components/ui/Badge'
import Haptics from '@/lib/haptics'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import IconButton from '@/components/ui/IconButton'
import ContextMenu from '@/components/ui/ContextMenu'
import { useCopyAction } from '@/components/ui/Copyeable'
import confirmDestructive from '@/lib/confirmDestructive'
import { analytics } from '@/lib/analytics'
import { isAppointment } from '@/lib/conversations'
import { useToastController } from '@tamagui/toast'
import { RootStackNavigation } from '@/types/rootStack'

/** Notes past this many lines are cut off in the row; the preview shows all. */
const NOTE_LINES = 10
const LONG_NOTE_CHARS = 400

/** Long-press preview for a visit whose note the row truncates. */
const ConversationPreview = ({ conversation }: { conversation: Visit }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 320,
        padding: 16,
        gap: 10,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {moment(conversation.date).format('dddd, L')}
      </Text>
      {conversation.followUp?.topic ? (
        <Text style={{ color: theme.colors.textAlt }}>
          {`${i18n.t('topic')}: ${conversation.followUp.topic}`}
        </Text>
      ) : null}
      <Text numberOfLines={40} style={{ lineHeight: 20 }}>
        {conversation.note}
      </Text>
    </View>
  )
}

const ConversationRow = ({
  conversation,
  highlighted,
}: {
  conversation: Visit
  highlighted?: boolean
}) => {
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()
  const { deleteConversation } = useConversations()
  const toast = useToastController()
  const copyAction = useCopyAction()
  const notificationHasPassed =
    conversation.followUp &&
    moment(conversation.followUp.date).isSameOrBefore(moment())

  const hasNoConversationDetails = !conversation.note?.length
  const note = conversation.note ?? ''
  const topic = conversation.followUp?.topic ?? ''
  const noteIsLong =
    note.length > LONG_NOTE_CHARS || note.split('\n').length > NOTE_LINES
  const dateLabel = moment(conversation.date).format('dddd, L')

  const handleNavigateEdit = () => {
    navigation.navigate('Visit Form', {
      contactId: conversation.contact.id,
      visitToEditId: conversation.id,
      notAtHome: conversation.notAtHome,
    })
  }

  /**
   * The one delete flow for this row — the context menu and the right-swipe
   * both land here.
   */
  const handleRequestDelete = () => {
    confirmDestructive({
      title: i18n.t('deleteConversation'),
      description: i18n.t('deleteConversation_description'),
      onConfirm: () => {
        deleteConversation(conversation.id)
        analytics.capture('visit_deleted')
        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
      },
    })
  }

  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    if (direction !== 'right') return

    // Snap the row back before the confirmation lands — the alert owns the
    // interaction from here, whichever way the user answers it.
    swipeable.reset()
    handleRequestDelete()
  }

  return (
    <Swipeable
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{ backgroundColor: theme.colors.backgroundLighter }}
      renderRightActions={() => <SwipeableDelete />}
      onSwipeableOpen={handleSwipeOpen}
    >
      <ContextMenu
        analyticsSurface='conversation_row'
        onPress={handleNavigateEdit}
        accessibilityLabel={dateLabel}
        preview={
          noteIsLong ? (
            <ConversationPreview conversation={conversation} />
          ) : undefined
        }
        actions={[
          [
            {
              id: 'edit',
              title: i18n.t('edit'),
              systemImage: 'pencil',
              onPress: handleNavigateEdit,
            },
            isAppointment(conversation) && {
              id: 'reschedule_follow_up',
              title: i18n.t('rescheduleFollowUp'),
              systemImage: 'calendar.badge.clock',
              onPress: () =>
                navigation.navigate('RescheduleVisit', {
                  contactId: conversation.contact.id,
                  visitId: conversation.id,
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
              onPress: handleRequestDelete,
            },
          ],
        ]}
      >
        <View
          style={{
            gap: 16,
            paddingVertical: 34,
            paddingHorizontal: 21,
            backgroundColor: theme.colors.card,
            borderWidth: highlighted ? 1 : 0,
            borderColor: highlighted ? theme.colors.accent : undefined,
          }}
        >
          {/* Header Section */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <View
              style={{
                flex: 1,
                gap: 4,
                minWidth: 0, // Allow text to shrink
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {moment(conversation.date).format('dddd, L')}
              </Text>

              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  color: theme.colors.textAlt,
                }}
              >
                {formatTime(conversation.date)}
              </Text>
            </View>
            {(conversation.isBibleStudy || conversation.notAtHome) && (
              <View style={{ flexShrink: 0 }}>
                <Badge color={theme.colors.accent3}>
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <IconButton
                      icon={conversation.notAtHome ? CaravanIcon : BookOpenIcon}
                      iconStyle={{ color: theme.colors.textInverse }}
                      size='sm'
                    />
                    <Text
                      style={{
                        fontFamily: theme.fonts.semiBold,
                        textTransform: 'uppercase',
                        fontSize: theme.fontSize('sm'),
                        color: theme.colors.textInverse,
                      }}
                      numberOfLines={1}
                    >
                      {conversation.notAtHome
                        ? i18n.t('notAtHome')
                        : i18n.t('study')}
                    </Text>
                  </View>
                </Badge>
              </View>
            )}
          </View>

          {/* Content Section */}
          <View style={{ gap: 16 }}>
            {/* Follow-up Section — present only when the Follow Up switch
                was on for this visit; the form strips it otherwise. */}
            {conversation.followUp && (
              <View
                style={{
                  borderColor: notificationHasPassed
                    ? theme.colors.border
                    : theme.colors.accent3,
                  borderWidth: 1,
                  borderRadius: theme.numbers.borderRadiusSm,
                  padding: 16,
                  backgroundColor: notificationHasPassed
                    ? theme.colors.backgroundLighter
                    : theme.colors.accent3 + '10',
                }}
              >
                {/* Follow-up Header */}
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {i18n.t('followUp')}
                  </Text>
                </View>

                {/* Follow-up Content */}
                <View style={{ gap: 12 }}>
                  {conversation.followUp?.date && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <IconButton
                        icon={
                          conversation.followUp.notifyMe
                            ? BellIcon
                            : BellOffIcon
                        }
                        iconStyle={{
                          color: notificationHasPassed
                            ? theme.colors.textAlt
                            : theme.colors.accent3,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: theme.fontSize('md'),
                          fontFamily: theme.fonts.semiBold,
                          color: notificationHasPassed
                            ? theme.colors.textAlt
                            : theme.colors.accent3,
                        }}
                      >
                        {moment(conversation.followUp.date).format('L LT')}
                      </Text>
                    </View>
                  )}

                  {conversation.followUp?.topic && (
                    <View>
                      <Text
                        style={{
                          fontSize: theme.fontSize('sm'),
                          fontFamily: theme.fonts.semiBold,
                          color: theme.colors.textAlt,
                          marginBottom: 6,
                        }}
                      >
                        {i18n.t('topic')}
                      </Text>
                      <Text
                        style={{
                          fontSize: theme.fontSize('md'),
                          color: notificationHasPassed
                            ? theme.colors.textAlt
                            : theme.colors.accent3,
                        }}
                      >
                        {conversation.followUp?.topic}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Notes Section */}
            {hasNoConversationDetails && (
              <View
                style={{
                  padding: 16,
                  backgroundColor: theme.colors.backgroundLighter,
                  borderRadius: theme.numbers.borderRadiusSm,
                  borderStyle: 'dashed',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('md'),
                    fontStyle: 'italic',
                    textAlign: 'center',
                  }}
                >
                  {i18n.t('noNotesSaved')}
                </Text>
              </View>
            )}

            {!!conversation.note?.length && (
              <View
                style={{
                  padding: 16,
                  backgroundColor: theme.colors.backgroundLighter,
                  borderRadius: theme.numbers.borderRadiusSm,
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {i18n.t('note')}
                </Text>
                <Text
                  numberOfLines={NOTE_LINES}
                  style={{
                    fontSize: theme.fontSize('md'),
                    lineHeight: theme.fontSize('md') * 1.4,
                  }}
                >
                  {conversation.note}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ContextMenu>
    </Swipeable>
  )
}

export default ConversationRow
