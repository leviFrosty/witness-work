import {
  ChevronLeft as ChevronLeftIcon,
  Menu as MenuIcon,
  X as XIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { Platform, Pressable, View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
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
   * long-pressable. Keeps an invisible target when there's no title.
   */
  onLongPressTitle?: () => void
}

// The nested provider measures the header's own safe area, so a screen pushed
// inside an iOS modal sheet gets no status-bar inset instead of the window's.
const Header = (props: Props) => (
  <SafeAreaProvider style={{ flex: 0 }}>
    <HeaderContent {...props} />
  </SafeAreaProvider>
)

const HeaderContent = ({
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

  const iconName = (): AppIcon => {
    if (buttonType === 'settings') {
      return MenuIcon
    }
    if (buttonType === 'exit') {
      return XIcon
    }
    if (buttonType === 'back') {
      return ChevronLeftIcon
    }

    return MenuIcon
  }

  return (
    <View
      style={{
        backgroundColor: backgroundColor || theme.colors.background,
        paddingTop:
          Platform.OS === 'ios' && (noInsets || insets.top === 0)
            ? 10
            : insets.top,
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
          style={
            onLongPressTitle && !title
              ? { minWidth: 120, minHeight: 24 }
              : undefined
          }
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
            {title}
          </Text>
        </Pressable>
        {rightElement}
      </View>
    </View>
  )
}

export default Header
