import { ReactNode, RefObject } from 'react'
import { View } from 'react-native'
import {
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  ChevronUp as ChevronUpIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export const FORM_ROW_MIN_HEIGHT = 52
export const FORM_ROW_ICON_SIZE = 20
export const FORM_ROW_PADDING_X = 14
const ROW_GAP = 12

/** Borderless input styling for a field that sits directly in a row. */
export const formRowInputStyle = {
  flex: 1,
  minWidth: 0,
  borderWidth: 0,
  backgroundColor: 'transparent',
  paddingHorizontal: 0,
}

/**
 * One line of a docked form's details list: an icon, the row's content, and an
 * optional trailing control. `expanded` content opens under the row, indented
 * to line up with the label.
 */
const FormRow = (props: {
  icon: AppIcon
  first?: boolean
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityExpanded?: boolean
  testID?: string
  /** For scrolling the row into view once it opens. */
  containerRef?: RefObject<View | null>
  children: ReactNode
  trailing?: ReactNode
  expanded?: ReactNode
}) => {
  const theme = useTheme()
  // Icon and trailing control line up with the first line of the content, so
  // they stay put when the content grows (a long note, place suggestions).
  const headerStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    paddingHorizontal: FORM_ROW_PADDING_X,
    gap: ROW_GAP,
  }
  const firstLine = {
    minHeight: FORM_ROW_MIN_HEIGHT,
    justifyContent: 'center' as const,
  }
  const header = (
    <>
      <View style={firstLine}>
        <LucideIcon
          icon={props.icon}
          size={FORM_ROW_ICON_SIZE}
          color={theme.colors.textAlt}
        />
      </View>
      <View style={{ ...firstLine, flex: 1, minWidth: 0 }}>
        {props.children}
      </View>
      {props.trailing && (
        <View
          style={{
            ...firstLine,
            flexDirection: 'row',
            alignItems: 'center',
            gap: ROW_GAP,
          }}
        >
          {props.trailing}
        </View>
      )}
    </>
  )

  return (
    <View
      ref={props.containerRef}
      style={{
        borderTopWidth: props.first ? 0 : 1,
        borderTopColor: theme.colors.border,
      }}
    >
      {props.onPress ? (
        <Button
          noTransform
          onPress={props.onPress}
          accessibilityRole='button'
          accessibilityLabel={props.accessibilityLabel}
          accessibilityState={
            props.accessibilityExpanded === undefined
              ? undefined
              : { expanded: props.accessibilityExpanded }
          }
          testID={props.testID}
          style={headerStyle}
        >
          {header}
        </Button>
      ) : (
        <View style={headerStyle} testID={props.testID}>
          {header}
        </View>
      )}
      {props.expanded && (
        <View
          style={{
            paddingLeft: FORM_ROW_PADDING_X + FORM_ROW_ICON_SIZE + ROW_GAP,
            paddingRight: FORM_ROW_PADDING_X,
            paddingBottom: 12,
          }}
        >
          {props.expanded}
        </View>
      )}
    </View>
  )
}

export const FormRowLabel = (props: { children: string }) => {
  const theme = useTheme()
  return (
    <Text
      style={{ fontFamily: theme.fonts.medium, fontSize: theme.fontSize('md') }}
    >
      {props.children}
    </Text>
  )
}

/** Muted value shown at the end of a collapsed row. */
export const FormRowValue = (props: { children?: string }) => {
  const theme = useTheme()
  if (!props.children) return null
  return (
    <Text
      numberOfLines={1}
      style={{ color: theme.colors.textAlt, maxWidth: '55%' }}
    >
      {props.children}
    </Text>
  )
}

/** The round "+" on an empty row that opens when tapped. */
export const FormRowAddBadge = () => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: theme.colors.accentTranslucent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon icon={PlusIcon} size={16} color={theme.colors.accent} />
    </View>
  )
}

export const FormRowChevron = (props: { open: boolean }) => {
  const theme = useTheme()
  return (
    <LucideIcon
      icon={props.open ? ChevronUpIcon : ChevronDownIcon}
      size={16}
      color={theme.colors.textAlt}
    />
  )
}

/** Trailing chevron for a filled row that opens its own screen. */
export const FormRowDisclosure = () => {
  const theme = useTheme()
  return (
    <LucideIcon
      icon={ChevronRightIcon}
      size={16}
      color={theme.colors.textAlt}
    />
  )
}

export default FormRow
