import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Children, Fragment, isValidElement, ReactNode, useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import Card from '@/components/ui/Card'
import Divider from '@/components/ui/Divider'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'

export const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
})

type Tone = 'default' | 'accent' | 'destructive'

const useToneColor = (tone: Tone) => {
  const theme = useTheme()
  return tone === 'destructive'
    ? theme.colors.error
    : tone === 'accent'
      ? theme.colors.accent
      : theme.colors.text
}

/**
 * Collapsible card for one tool area. The header stays one line — long
 * explanations go in `info` (InfoPopover) and live state goes in `summary` so
 * the page scans without expanding anything.
 */
export const ToolSection = ({
  title,
  icon,
  info,
  summary,
  tone = 'default',
  defaultExpanded = false,
  children,
}: {
  title: string
  icon: AppIcon
  info?: string
  summary?: string
  tone?: Tone
  defaultExpanded?: boolean
  children: ReactNode
}) => {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const toneColor = useToneColor(tone)

  return (
    <Card style={{ paddingVertical: 4, paddingHorizontal: 16, gap: 0 }}>
      <Pressable
        accessibilityRole='button'
        accessibilityState={{ expanded }}
        onPress={() => {
          Haptics.light()
          setExpanded(!expanded)
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          gap: 10,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <LucideIcon
          icon={icon}
          size={theme.fontSize('lg')}
          color={tone === 'default' ? theme.colors.textAlt : toneColor}
        />
        <XView style={{ flexShrink: 1, gap: 0 }}>
          <Text
            accessibilityRole='header'
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
              color: tone === 'destructive' ? toneColor : theme.colors.text,
            }}
          >
            {title}
          </Text>
          {info && <InfoPopover title={title} description={info} inline />}
        </XView>
        <View style={{ flex: 1 }} />
        {summary ? (
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {summary}
          </Text>
        ) : null}
        <LucideIcon
          icon={expanded ? ChevronDown : ChevronRight}
          size={theme.fontSize('md')}
          color={theme.colors.textAlt}
        />
      </Pressable>
      {expanded && (
        <View style={{ paddingBottom: 8 }}>
          <Divider />
          {children}
        </View>
      )}
    </Card>
  )
}

/** Small uppercase label that splits a section into sub-groups. */
export const ToolSubheading = ({
  title,
  info,
}: {
  title: string
  info?: string
}) => {
  const theme = useTheme()
  return (
    <XView style={{ gap: 0, paddingTop: 14, paddingBottom: 2 }}>
      <Text
        accessibilityRole='header'
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {info && <InfoPopover title={title} description={info} inline />}
    </XView>
  )
}

/**
 * One line in a tool list. With `onPress` it's an action (tinted label);
 * otherwise it's a read-only stat whose `value` renders mono + selectable.
 * `trailing` replaces the value with a control (Switch, picker, input).
 */
export const ToolRow = ({
  label,
  info,
  value,
  trailing,
  onPress,
  disabled,
  tone,
}: {
  label: string
  info?: string
  value?: string
  trailing?: ReactNode
  onPress?: () => unknown
  disabled?: boolean
  tone?: Tone
}) => {
  const theme = useTheme()
  const isAction = !!onPress
  const toneColor = useToneColor(tone ?? (isAction ? 'accent' : 'default'))

  const content = (
    <>
      <XView style={{ flexShrink: 1, gap: 0 }}>
        <Text
          style={{
            flexShrink: 1,
            color: disabled ? theme.colors.textAlt : toneColor,
            fontFamily: isAction ? theme.fonts.semiBold : theme.fonts.regular,
          }}
        >
          {label}
        </Text>
        {info && <InfoPopover title={label} description={info} inline />}
      </XView>
      <View style={{ flex: 1, minWidth: 8 }} />
      {trailing ??
        (value !== undefined ? (
          <Text
            selectable
            style={{
              flexShrink: 1,
              color: theme.colors.textAlt,
              fontFamily: MONO,
              fontSize: theme.fontSize('sm'),
              textAlign: 'right',
            }}
          >
            {value}
          </Text>
        ) : null)}
    </>
  )

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 44,
    paddingVertical: 6,
  }

  if (!isAction) return <View style={rowStyle}>{content}</View>

  return (
    <Pressable
      accessibilityRole='button'
      disabled={disabled}
      onPress={() => {
        Haptics.light()
        void onPress()
      }}
      style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.5 : 1 }]}
    >
      {content}
    </Pressable>
  )
}

/** Stacks rows with hairline dividers between them. */
export const ToolList = ({ children }: { children: ReactNode }) => {
  const items = Children.toArray(children).filter(isValidElement)
  return (
    <View>
      {items.map((child, i) => (
        <Fragment key={child.key ?? i}>
          {i > 0 && <Divider />}
          {child}
        </Fragment>
      ))}
    </View>
  )
}

/** Big tap target for the actions reached for most often. */
export const QuickTile = ({
  icon,
  label,
  caption,
  onPress,
  tone = 'accent',
  disabled,
}: {
  icon: AppIcon
  label: string
  caption?: string
  onPress: () => unknown
  tone?: Tone
  disabled?: boolean
}) => {
  const theme = useTheme()
  const color = useToneColor(tone)
  const tint =
    tone === 'destructive'
      ? theme.colors.errorTranslucent
      : tone === 'accent'
        ? theme.colors.accentTranslucent
        : theme.colors.backgroundLighter

  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      disabled={disabled}
      onPress={() => {
        Haptics.light()
        void onPress()
      }}
      style={({ pressed }) => ({
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 84,
        padding: 12,
        gap: 6,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: tint,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
        justifyContent: 'space-between',
      })}
    >
      <LucideIcon icon={icon} size={theme.fontSize('xl')} color={color} />
      <View>
        <Text
          numberOfLines={2}
          style={{ fontFamily: theme.fonts.semiBold, color: theme.colors.text }}
        >
          {label}
        </Text>
        {caption ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
