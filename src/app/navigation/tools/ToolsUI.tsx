import { ChevronDown } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  ReactNode,
  useContext,
  useState,
} from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import Button from '@/components/ui/Button'
import Section from '@/components/ui/inputs/Section'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import Divider from '@/components/ui/Divider'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import { alignText } from '@/lib/direction'
import { tracking } from '@/lib/tracking'

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

const InToolGroup = createContext(false)

const GroupHeader = ({ title }: { title: string }) => {
  const theme = useTheme()
  return (
    <Text
      accessibilityRole='header'
      style={{
        marginStart: inputLayout.horizontalPadding,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('sm'),
        color: theme.colors.textAlt,
      }}
    >
      {title}
    </Text>
  )
}

const hairline = StyleSheet.hairlineWidth

export const ToolGroup = ({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) => (
  <View style={{ gap: 8 }}>
    {title ? <GroupHeader title={title} /> : null}
    <Section animateRows={false}>
      <View style={{ marginBottom: -hairline }}>
        <InToolGroup.Provider value>{children}</InToolGroup.Provider>
      </View>
    </Section>
  </View>
)

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
  const inGroup = useContext(InToolGroup)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const toneColor = useToneColor(tone)

  const row = (
    <View>
      <Button
        noTransform
        accessibilityRole='button'
        accessibilityLabel={summary ? `${title}, ${summary}` : title}
        accessibilityState={{ expanded }}
        onPress={() => {
          Haptics.light()
          setExpanded(!expanded)
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: inputLayout.rowMinHeight,
          paddingVertical: 10,
          paddingHorizontal: inputLayout.horizontalPadding,
          gap: inputLayout.labelGap,
        }}
      >
        <LucideIcon
          icon={icon}
          size={inputLayout.iconSize}
          color={tone === 'default' ? theme.colors.textAlt : toneColor}
        />
        <XView style={{ flexShrink: 0, maxWidth: '70%', gap: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.medium,
              fontSize: theme.fontSize('md'),
              color: tone === 'destructive' ? toneColor : theme.colors.text,
            }}
          >
            {title}
          </Text>
          {info && <InfoPopover title={title} description={info} inline />}
        </XView>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: alignText('end'),
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {summary}
        </Text>
        <LucideIcon
          icon={expanded ? ChevronDown : ChevronForwardIcon}
          size={theme.fontSize('md')}
          color={theme.colors.textAlt}
        />
      </Button>
      {expanded && (
        <View
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingBottom: inputLayout.rowPadding,
          }}
        >
          <Divider />
          {children}
        </View>
      )}
      {inGroup && <RowSeparator hasIcon />}
    </View>
  )

  return inGroup ? row : <Section animateRows={false}>{row}</Section>
}

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
          letterSpacing: tracking(0.8),
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {info && <InfoPopover title={title} description={info} inline />}
    </XView>
  )
}

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
              textAlign: alignText('end'),
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
    minHeight: Platform.select({ android: 48, default: 44 }),
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
        : theme.colors.background

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
        borderRadius: inputLayout.sectionRadius - QUICK_TILE_INSET,
        borderCurve: 'continuous',
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

const QUICK_TILE_INSET = 12

export const QuickTiles = ({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) => (
  <View style={{ gap: 8 }}>
    {title ? <GroupHeader title={title} /> : null}
    <Section animateRows={false} style={{ padding: QUICK_TILE_INSET }}>
      <XView style={{ flexWrap: 'wrap', gap: 10 }}>{children}</XView>
    </Section>
  </View>
)
