import { useEffect, useState } from 'react'
import { View } from 'react-native'
import {
  Camera as CameraIcon,
  CircleAlert as CircleAlertIcon,
  FileText as FileTextIcon,
  Gauge as GaugeIcon,
  Mic as MicIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import ShimmerText from '@/components/ui/ShimmerText'
import useTheme from '@/contexts/theme'
import useAppActive from '@/hooks/useAppActive'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { usePreferences } from '@/stores/preferences'
import type {
  ScribeActivityArea,
  ScribeError,
  ScribeInputSource,
  ScribeNotice,
  ScribeRun,
} from '@/features/scribe/types'
import ScribeOrb from '@/features/scribe/components/ScribeOrb'
import { useScribeRuns } from '@/features/scribe/runtime/runs'
import {
  errorCopy,
  limitNoticeCopy,
} from '@/features/scribe/components/scribeCopy'

const ACTIVITY_COPY: Record<ScribeActivityArea, TranslationKey> = {
  contacts: 'scribe_activity_contacts',
  visits: 'scribe_activity_visits',
  plans: 'scribe_activity_plans',
  time: 'scribe_activity_time',
  buddies: 'scribe_activity_buddies',
}

const SOURCE_ICON: Partial<Record<ScribeInputSource, AppIcon>> = {
  voice: MicIcon,
  photo: CameraIcon,
  paper: FileTextIcon,
}

/** What the User sent, on the trailing side; spoken ones carry a mic. */
export const ScribeUserBubble = ({
  text,
  source,
}: {
  text: string
  source: ScribeInputSource
}) => {
  const theme = useTheme()
  const icon = SOURCE_ICON[source]
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '85%',
        backgroundColor: theme.colors.accentBubble,
        borderRadius: 20,
        borderBottomEndRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 4,
      }}
    >
      {icon ? (
        <LucideIcon icon={icon} size={13} color={theme.colors.textAlt} />
      ) : null}
      <Text
        selectable
        style={{ fontSize: theme.fontSize('md'), lineHeight: 22 }}
      >
        {text}
      </Text>
    </View>
  )
}

/** Scribe AI's answer: plain text, no markdown, links or images. */
export const ScribeAssistantText = ({ text }: { text: string }) => {
  const theme = useTheme()
  return (
    <Text
      selectable
      style={{
        fontSize: theme.fontSize('md'),
        lineHeight: 23,
        paddingHorizontal: 4,
      }}
    >
      {text}
    </Text>
  )
}

const Line = ({
  icon,
  text,
  tone = 'muted',
}: {
  icon: AppIcon
  text: string
  tone?: 'muted' | 'warn'
}) => {
  const theme = useTheme()
  const color = tone === 'warn' ? theme.colors.warnText : theme.colors.textAlt
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 4,
      }}
    >
      <LucideIcon
        icon={icon}
        size={16}
        color={color}
        style={{ marginTop: 2 }}
      />
      <Text style={{ flex: 1, fontSize: theme.fontSize('md'), color }}>
        {text}
      </Text>
    </View>
  )
}

/** A turn that ended without an answer or cards. */
export const ScribeNoticeRow = ({ notice }: { notice: ScribeNotice }) => {
  switch (notice.kind) {
    case 'limit_reached':
      return (
        <Line
          icon={GaugeIcon}
          tone='warn'
          text={limitNoticeCopy(notice.resetsAt)}
        />
      )
    case 'too_much':
      return (
        <Line icon={CircleAlertIcon} text={i18n.t('scribe_errorTooMuch')} />
      )
    case 'couldnt_finish':
      return (
        <Line
          icon={CircleAlertIcon}
          text={i18n.t('scribe_errorCouldntFinish')}
        />
      )
    case 'refused':
      return (
        <Line icon={CircleAlertIcon} text={i18n.t('scribe_errorRefused')} />
      )
  }
}

/** 999 → "999", 1234 → "1.2k": stays narrow as it climbs. */
const formatTokens = (tokens: number): string =>
  tokens < 1000
    ? formatNumber(tokens)
    : `${formatNumber(Math.round(tokens / 100) / 10)}k`

/**
 * Developer Tools only: time since the turn started and about how many tokens
 * it has produced (finished steps' output, then streamed text ÷ 4).
 */
const ScribeRunDebug = ({ conversationId }: { conversationId: string }) => {
  const theme = useTheme()
  const debug = useScribeRuns((s) => s.debug[conversationId])
  const [now, setNow] = useState(() => Date.now())
  // In the background (a turn keeps going there), nobody sees it tick.
  const appActive = useAppActive()
  useEffect(() => {
    if (!appActive) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [appActive])
  if (!debug) return null
  const seconds = Math.max(0, (now - debug.startedAt) / 1000)
  const tokens = debug.outputTokens + Math.round(debug.streamedChars / 4)
  return (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('xs'),
        fontVariant: ['tabular-nums'],
      }}
    >
      {i18n.t('scribe_runDebugStats', {
        seconds: formatNumber(seconds, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
        tokens: formatTokens(tokens),
      })}
    </Text>
  )
}

/**
 * "Thinking…" or what it's reading, with a shine sweeping across it and a small
 * organizing orb. Time and tokens show only with Developer Tools on.
 */
export const ScribeRunRow = ({
  run,
  conversationId,
}: {
  run: ScribeRun
  conversationId: string | null
}) => {
  const theme = useTheme()
  const developerTools = usePreferences((s) => s.developerTools)
  if (run.phase !== 'sending' && run.phase !== 'thinking') return null
  const area =
    run.phase === 'thinking' ? run.reading[run.reading.length - 1] : undefined
  return (
    <View
      accessibilityLiveRegion='polite'
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <ScribeOrb size={40} core={0.3} state='organizing' />
      <View style={{ flexShrink: 1, gap: 2 }}>
        <ShimmerText
          style={{
            fontSize: theme.fontSize('md'),
            color: theme.colors.textAlt,
          }}
          highlightColor={theme.colors.text}
          strength={0.9}
        >
          {i18n.t(area ? ACTIVITY_COPY[area] : 'scribe_thinking')}
        </ShimmerText>
        {developerTools && conversationId ? (
          <ScribeRunDebug conversationId={conversationId} />
        ) : null}
      </View>
    </View>
  )
}

/** A failed turn and, when it can be retried, Try again. */
export const ScribeErrorRow = ({
  error,
  onRetry,
}: {
  error: ScribeError
  onRetry: () => void
}) => {
  const theme = useTheme()
  const copy = errorCopy(error.code)
  if (!copy) return null
  return (
    <View style={{ gap: 8 }}>
      <Line icon={CircleAlertIcon} tone='warn' text={i18n.t(copy)} />
      {error.retryable ? (
        <Button
          noTransform
          onPress={onRetry}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            paddingHorizontal: 16,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            justifyContent: 'center',
            marginLeft: 28,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm') + 1,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('scribe_tryAgain')}
          </Text>
        </Button>
      ) : null}
    </View>
  )
}
