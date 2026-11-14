import { ChevronDown, Search as SearchIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import {
  createContext,
  ReactNode,
  useContext,
  useDeferredValue,
  useId,
  useLayoutEffect,
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
import JsonViewer from '@/features/contacts/components/JsonViewer'
import {
  foldToolsText,
  matchesToolsSearch,
  toolsSearchTokens,
} from '@/app/navigation/tools/toolsSearch'

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

type ReportMatch = (id: string, matched: boolean) => void

const NO_TOKENS: readonly string[] = []
const SearchTokens = createContext<readonly string[]>(NO_TOKENS)

const SearchPath = createContext('')
const MatchScope = createContext<ReportMatch | null>(null)

const ContainerShown = createContext(true)

const HIDDEN = { display: 'none' } as const

function useMatchScope() {
  const [count, setCount] = useState(0)
  const [report] = useState(() => {
    const matched = new Set<string>()
    const reportMatch: ReportMatch = (id, isMatch) => {
      if (isMatch) matched.add(id)
      else matched.delete(id)
      setCount(matched.size)
    }
    return reportMatch
  })
  return { report, hasMatch: count > 0 }
}

function useReportMatch(matched: boolean) {
  const report = useContext(MatchScope)
  const id = useId()

  useLayoutEffect(() => {
    if (!report || !matched) return
    report(id, true)
    return () => report(id, false)
  }, [report, id, matched])
}

function useLeafMatch(...words: (string | undefined)[]): boolean {
  const tokens = useContext(SearchTokens)
  const path = useContext(SearchPath)
  const searching = tokens.length > 0
  const matched = searching && matchesToolsSearch(tokens, path, ...words)
  useReportMatch(matched)
  return !searching || matched
}

type ContainerMatch = {
  searching: boolean
  shown: boolean
  path: string
  report: ReportMatch
}

function useContainerMatch(words?: string): ContainerMatch {
  const tokens = useContext(SearchTokens)
  const parentPath = useContext(SearchPath)
  const searching = tokens.length > 0
  const path = words ? `${parentPath} ${foldToolsText(words)}` : parentPath
  const { report, hasMatch } = useMatchScope()
  const titleMatches =
    searching && words !== undefined && matchesToolsSearch(tokens, path)
  const shown = !searching || titleMatches || hasMatch
  useReportMatch(searching && shown)
  return { searching, shown, path, report }
}

const SearchContainer = ({
  match,
  children,
}: {
  match: ContainerMatch
  children: ReactNode
}) => (
  <SearchPath.Provider value={match.path}>
    <MatchScope.Provider value={match.report}>
      <ContainerShown.Provider value={match.shown}>
        {children}
      </ContainerShown.Provider>
    </MatchScope.Provider>
  </SearchPath.Provider>
)

export const ToolsSearch = ({
  query,
  children,
}: {
  query: string
  children: ReactNode
}) => {
  const theme = useTheme()

  const tokens = toolsSearchTokens(useDeferredValue(query))
  const { report, hasMatch } = useMatchScope()

  return (
    <SearchTokens.Provider value={tokens}>
      <MatchScope.Provider value={report}>
        {children}
        {tokens.length > 0 && !hasMatch ? (
          <View
            accessibilityLiveRegion='polite'
            style={{ alignItems: 'center', gap: 12, paddingTop: 48 }}
          >
            <LucideIcon
              icon={SearchIcon}
              size={24}
              color={theme.colors.textAlt}
            />
            <Text style={{ color: theme.colors.textAlt }}>No tools found</Text>
          </View>
        ) : null}
      </MatchScope.Provider>
    </SearchTokens.Provider>
  )
}

export const ToolSearchable = ({
  words,
  children,
}: {
  words: string
  children: ReactNode
}) => {
  const match = useContainerMatch(words)
  return (
    <View style={match.shown ? undefined : HIDDEN}>
      <SearchContainer match={match}>{children}</SearchContainer>
    </View>
  )
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
}) => {
  const match = useContainerMatch()
  return (
    <View style={match.shown ? { gap: 8 } : HIDDEN}>
      {title ? <GroupHeader title={title} /> : null}
      <Section animateRows={false}>
        <View style={{ marginBottom: -hairline }}>
          <InToolGroup.Provider value>
            <SearchContainer match={match}>{children}</SearchContainer>
          </InToolGroup.Provider>
        </View>
      </Section>
    </View>
  )
}

const GroupRow = ({
  icon,
  title,
  info,
  summary,
  tone,
  trailing,
  accessibilityState,
  onPress,
}: {
  icon: AppIcon
  title: string
  info?: string
  summary?: string
  tone: Tone
  trailing?: ReactNode
  accessibilityState?: { expanded: boolean }
  onPress?: () => unknown
}) => {
  const theme = useTheme()
  const toneColor = useToneColor(tone)
  return (
    <Button
      noTransform
      accessibilityRole={onPress ? 'button' : 'header'}
      accessibilityLabel={summary ? `${title}, ${summary}` : title}
      accessibilityState={accessibilityState}
      disabled={!onPress}
      onPress={() => {
        Haptics.light()
        void onPress?.()
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
      {trailing}
    </Button>
  )
}

export const ToolSection = ({
  title,
  icon,
  info,
  summary,
  keywords,
  tone = 'default',
  defaultExpanded = false,
  children,
}: {
  title: string
  icon: AppIcon
  info?: string
  summary?: string

  keywords?: string
  tone?: Tone
  defaultExpanded?: boolean
  children: ReactNode
}) => {
  const theme = useTheme()
  const inGroup = useContext(InToolGroup)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const match = useContainerMatch(keywords ? `${title} ${keywords}` : title)

  const open = match.searching || expanded

  const row = (
    <View style={match.shown ? undefined : HIDDEN}>
      <GroupRow
        icon={icon}
        title={title}
        info={info}
        summary={summary}
        tone={tone}
        accessibilityState={match.searching ? undefined : { expanded }}
        onPress={match.searching ? undefined : () => setExpanded(!expanded)}
        trailing={
          match.searching ? null : (
            <LucideIcon
              icon={expanded ? ChevronDown : ChevronForwardIcon}
              size={theme.fontSize('md')}
              color={theme.colors.textAlt}
            />
          )
        }
      />
      {open && (
        <View
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingBottom: inputLayout.rowPadding,
          }}
        >
          <Divider />
          <SearchContainer match={match}>{children}</SearchContainer>
        </View>
      )}
      {inGroup && <RowSeparator hasIcon />}
    </View>
  )

  return inGroup ? row : <Section animateRows={false}>{row}</Section>
}

export const ToolAction = ({
  title,
  icon,
  summary,
  keywords,
  tone = 'default',
  onPress,
}: {
  title: string
  icon: AppIcon
  summary?: string
  keywords?: string
  tone?: Tone
  onPress: () => unknown
}) => {
  const inGroup = useContext(InToolGroup)
  const shown = useLeafMatch(title, keywords)
  if (!shown) return null
  return (
    <View>
      <GroupRow
        icon={icon}
        title={title}
        summary={summary}
        tone={tone}
        onPress={onPress}
      />
      {inGroup && <RowSeparator hasIcon />}
    </View>
  )
}

export const ToolSubsection = ({
  title,
  info,
  keywords,
  children,
}: {
  title: string
  info?: string
  keywords?: string
  children?: ReactNode
}) => {
  const theme = useTheme()
  const match = useContainerMatch(keywords ? `${title} ${keywords}` : title)
  return (
    <View style={match.shown ? undefined : HIDDEN}>
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
      <SearchContainer match={match}>{children}</SearchContainer>
    </View>
  )
}

const InToolList = createContext(false)

export const ToolRow = ({
  label,
  info,
  value,
  keywords,
  trailing,
  onPress,
  disabled,
  tone,
}: {
  label: string
  info?: string
  value?: string
  keywords?: string
  trailing?: ReactNode
  onPress?: () => unknown
  disabled?: boolean
  tone?: Tone
}) => {
  const theme = useTheme()
  const inList = useContext(InToolList)
  const isAction = !!onPress
  const toneColor = useToneColor(tone ?? (isAction ? 'accent' : 'default'))
  const shown = useLeafMatch(label, keywords)
  if (!shown) return null

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

    borderTopWidth: inList ? LIST_LINE : 0,
    borderTopColor: theme.colors.border,
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

const LIST_LINE = 1

export const ToolList = ({ children }: { children: ReactNode }) => (
  <View style={{ overflow: 'hidden' }}>
    <View style={{ marginTop: -LIST_LINE }}>
      <InToolList.Provider value>{children}</InToolList.Provider>
    </View>
  </View>
)

export const ToolJson = (props: {
  label: string
  value: unknown
  count?: number
}) => {
  const shown = useContext(ContainerShown)
  return shown ? <JsonViewer {...props} /> : null
}

export const QuickTile = ({
  icon,
  label,
  caption,
  keywords,
  onPress,
  tone = 'accent',
  disabled,
}: {
  icon: AppIcon
  label: string
  caption?: string
  keywords?: string
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
  const shown = useLeafMatch(label, keywords)
  if (!shown) return null

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
  title: string
  children: ReactNode
}) => {
  const match = useContainerMatch(title)
  return (
    <View style={match.shown ? { gap: 8 } : HIDDEN}>
      <GroupHeader title={title} />
      <Section animateRows={false} style={{ padding: QUICK_TILE_INSET }}>
        <XView style={{ flexWrap: 'wrap', gap: 10 }}>
          <SearchContainer match={match}>{children}</SearchContainer>
        </XView>
      </Section>
    </View>
  )
}
