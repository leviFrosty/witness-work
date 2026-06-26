import { Platform, Pressable, View } from 'react-native'
import useTheme from '@/contexts/theme'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import Text from '@/components/ui/MyText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import {
  faBars,
  faChevronLeft,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import { RootStackNavigation } from '@/types/rootStack'

type Props = {
  backgroundColor?: string
  inverseTextAndIconColor?: boolean
  /**
   * Hard override for the chevron + title color. Wins over
   * `inverseTextAndIconColor` so callers can react to a dynamic background
   * (e.g. a contact's hero tint) and keep contrast.
   */
  foregroundColor?: string
  title?: string
  buttonType?: 'exit' | 'settings' | 'back' | 'none'
  onPressLeftIcon?: () => void
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
  noBottomBorder?: boolean
  noInsets?: boolean
  /**
   * Optional long-press handler on the title. Used for hidden dev affordances
   * (e.g. resetting the milestone-reveal flags from the home header). Pure
   * pass-through — Header doesn't add visual chrome to indicate it's
   * long-pressable.
   */
  onLongPressTitle?: () => void
}

const Header = ({
  title,
  buttonType,
  rightElement,
  leftElement,
  backgroundColor,
  inverseTextAndIconColor,
  foregroundColor,
  noBottomBorder,
  noInsets,
  onPressLeftIcon,
  onLongPressTitle,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  const handleButtonAction = () => {
    if (onPressLeftIcon) {
      return onPressLeftIcon()
    }
    if (buttonType === 'exit') {
      navigation.popToTop()
    }
    if (buttonType === 'back') {
      navigation.goBack()
    }
  }

  const iconName = (): IconProp => {
    if (buttonType === 'settings') {
      return faBars
    }
    if (buttonType === 'exit') {
      return faTimes
    }
    if (buttonType === 'back') {
      return faChevronLeft
    }

    return faBars
  }

  return (
    <View
      style={{
        backgroundColor: backgroundColor || theme.colors.background,
        paddingTop: noInsets && Platform.OS === 'ios' ? 10 : insets.top,
        borderBottomWidth: noBottomBorder ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          position: 'relative',
          flexGrow: 1,
          marginHorizontal: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
        }}
      >
        {leftElement ? (
          <View style={{ position: 'absolute', left: 0 }}>{leftElement}</View>
        ) : (
          buttonType !== 'none' && (
            <IconButton
              style={{ position: 'absolute', left: 0 }}
              onPress={handleButtonAction}
              icon={iconName()}
              hitSlop={24}
              iconStyle={{
                color:
                  foregroundColor ??
                  (inverseTextAndIconColor
                    ? theme.colors.textInverse
                    : theme.colors.text),
              }}
              size={'xl'}
            />
          )
        )}
        <Pressable
          onLongPress={onLongPressTitle}
          disabled={!onLongPressTitle}
          delayLongPress={800}
        >
          <Text
            style={{
              fontSize: 18,
              fontFamily: theme.fonts.semiBold,
              color:
                foregroundColor ??
                (inverseTextAndIconColor
                  ? theme.colors.textInverse
                  : theme.colors.text),
            }}
          >
            {title ?? formatDate(moment())}
          </Text>
        </Pressable>
        {rightElement}
      </View>
    </View>
  )
}

export default Header
