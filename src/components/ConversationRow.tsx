import { Alert, View } from 'react-native'
import Text from './MyText'
import { Conversation } from '../types/conversation'
import moment from 'moment'
import useTheme from '../contexts/theme'
import useConversations from '../stores/conversationStore'
import i18n from '../lib/locales'
import { useNavigation } from '@react-navigation/native'
import { Swipeable } from 'react-native-gesture-handler'
import Badge from './Badge'
import Haptics from '../lib/haptics'
import SwipeableDelete from './swipeableActions/Delete'
import SwipeableEdit from './swipeableActions/Edit'
import IconButton from './IconButton'
import {
  faBell,
  faBellSlash,
  faBook,
  faCaravan,
} from '@fortawesome/free-solid-svg-icons'
import Copyeable from './Copyeable'
import Button from './Button'
import { RootStackNavigation } from '../types/rootStack'

const ConversationRow = ({
  conversation,
  highlighted,
}: {
  conversation: Conversation
  highlighted?: boolean
}) => {
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()
  const { deleteConversation } = useConversations()
  const notificationHasPassed =
    conversation.followUp &&
    moment(conversation.followUp.date).isSameOrBefore(moment())

  const hasNoConversationDetails = !conversation.note?.length

  const handleNavigateEdit = () => {
    navigation.navigate('Conversation Form', {
      contactId: conversation.contact.id,
      conversationToEditId: conversation.id,
      notAtHome: conversation.notAtHome,
    })
  }

  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    if (direction === 'left') {
      handleNavigateEdit()
      swipeable.reset()
    } else {
      Alert.alert(
        i18n.t('deleteConversation'),
        i18n.t('deleteConversation_description'),
        [
          {
            text: i18n.t('cancel'),
            style: 'cancel',
            onPress: () => {
              swipeable.reset()
            },
          },
          {
            text: i18n.t('delete'),
            style: 'destructive',
            onPress: () => {
              swipeable.reset()
              deleteConversation(conversation.id)
            },
          },
        ]
      )
    }
  }

  return (
    <Swipeable
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{ backgroundColor: theme.colors.backgroundLighter }}
      renderLeftActions={() => <SwipeableEdit />}
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
                {moment(conversation.date).format('LT')}
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
                      icon={conversation.notAtHome ? faCaravan : faBook}
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
                          conversation.followUp.notifyMe ? faBell : faBellSlash
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
