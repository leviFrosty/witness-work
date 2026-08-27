import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  BookOpen as BookOpenIcon,
  Caravan as CaravanIcon,
  Pencil as PencilIcon,
  Trash2 as Trash2Icon,
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
import Copyeable from '@/components/ui/Copyeable'
import Button from '@/components/ui/Button'
import RowActionsMenu from '@/components/RowActionsMenu'
import confirmDestructive from '@/lib/confirmDestructive'
import { useToastController } from '@tamagui/toast'
import { RootStackNavigation } from '@/types/rootStack'

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
  const notificationHasPassed =
    conversation.followUp &&
    moment(conversation.followUp.date).isSameOrBefore(moment())

  const hasNoConversationDetails = !conversation.note?.length

  const handleNavigateEdit = () => {
    navigation.navigate('Visit Form', {
      contactId: conversation.contact.id,
      visitToEditId: conversation.id,
      notAtHome: conversation.notAtHome,
    })
  }

  /**
   * The one delete flow for this row — the overflow menu and the right-swipe
   * both land here.
   */
  const handleRequestDelete = () => {
    confirmDestructive({
      title: i18n.t('deleteConversation'),
      description: i18n.t('deleteConversation_description'),
      onConfirm: () => {
        deleteConversation(conversation.id)
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
      <Button
        onPress={handleNavigateEdit}
        style={{
          paddingHorizontal: 5,
          paddingVertical: 10,
          backgroundColor: theme.colors.card,
          borderWidth: highlighted ? 1 : 0,
          borderColor: highlighted ? theme.colors.accent : undefined,
        }}
      >
        <View
          style={{
            gap: 16,
            paddingVertical: 24,
            paddingHorizontal: 16,
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
            <RowActionsMenu
              accessibilityLabel={i18n.t('moreActionsFor', {
                name: moment(conversation.date).format('dddd, L'),
              })}
              actions={[
                {
                  id: 'edit-conversation',
                  label: i18n.t('edit'),
                  icon: PencilIcon,
                  onPress: handleNavigateEdit,
                },
                {
                  id: 'delete-conversation',
                  label: i18n.t('delete'),
                  icon: Trash2Icon,
                  destructive: true,
                  onPress: handleRequestDelete,
                },
              ]}
            />
          </View>

          {/* Content Section */}
          <View style={{ gap: 16 }}>
            {/* Follow-up Section */}
            {(conversation.followUp?.notifyMe ||
              conversation.followUp?.topic) && (
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
                      <Copyeable
                        textProps={{
                          style: {
                            fontSize: theme.fontSize('md'),
                            color: notificationHasPassed
                              ? theme.colors.textAlt
                              : theme.colors.accent3,
                          },
                        }}
                      >
                        {conversation.followUp?.topic}
                      </Copyeable>
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
                <Copyeable
                  textProps={{
                    style: {
                      fontSize: theme.fontSize('md'),
                      lineHeight: theme.fontSize('md') * 1.4,
                    },
                  }}
                >
                  {conversation.note}
                </Copyeable>
              </View>
            )}
          </View>
        </View>
      </Button>
    </Swipeable>
  )
}

export default ConversationRow
