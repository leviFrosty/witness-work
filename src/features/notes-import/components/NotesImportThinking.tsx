import { Timer as TimerIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import ShimmerText from '@/components/ui/ShimmerText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { TranslationKey } from '@/lib/locales'
import NotesImportAvatar from '@/features/notes-import/components/NotesImportAvatar'

const ACTIVE_STATUS_KEYS: TranslationKey[] = [
  'notesImport_submitting',
  'notesImport_thinking',
  'notesImport_deliberating',
  'notesImport_organizing',
  'notesImport_preparing',
]
const RESUMING_STATUS_KEYS: TranslationKey[] = [
  'notesImport_resuming',
  ...ACTIVE_STATUS_KEYS,
]

/**
 * Token-count readout: absolute below 1,000, then a single-decimal "k" form so
 * the heartbeat stays narrow as it climbs (e.g. 999 → "999", 1000 → "1k", 1234
 * → "1.2k").
 */
const formatTokens = (tokens: number): string => {
  if (tokens < 1000) return `${tokens}`
  const thousands = Math.round((tokens / 1000) * 10) / 10
  return `${thousands}k`
}

interface Props {
  reasoning?: string
  reconnecting?: boolean
  /** Epoch ms the current run started — drives the dev-only inference timer. */
  startedAt?: number | null
  /** Approximate tokens processed — a dev-only "it's reasoning" heartbeat. */
  tokens?: number
  /**
   * Show the generic "you can leave and come back" subtext after ~15s. Defaults
   * to true; onboarding turns it off because it shows a richer continue-setup
   * message in its place.
   */
  leaveHint?: boolean
}

/** Compact, continuously changing processing state for a live Notes Import. */
const NotesImportThinking = ({
  reasoning,
  reconnecting,
  startedAt,
  tokens,
  leaveHint = true,
}: Props) => {
  const theme = useTheme()
  const [statusIndex, setStatusIndex] = useState(0)
  const statusKeys = reconnecting ? RESUMING_STATUS_KEYS : ACTIVE_STATUS_KEYS

  // Once a run has been working a little while, reassure the user it isn't stuck
  // and they don't have to wait on this screen — the import persists and resumes,
  // so they can leave and come back. A reconnecting run has already been going,
  // so surface the hint immediately rather than waiting out another 15s.
  const [showLeaveHint, setShowLeaveHint] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setShowLeaveHint(true), 25_000)
    return () => clearTimeout(id)
  }, [])

  // Live inference readout (elapsed + approximate tokens), shown in every build
  // while the model works so the user can see it's actively reasoning. Only the
  // reasoning TEXT panel below is dev-only.
  const showInferenceStats = startedAt != null
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!showInferenceStats) return
    const id = setInterval(() => setNowMs(Date.now()), 100)
    return () => clearInterval(id)
  }, [showInferenceStats])
  const elapsedSec =
    startedAt != null ? Math.max(0, (nowMs - startedAt) / 1000) : 0

  useEffect(() => {
    const statusCount = reconnecting
      ? RESUMING_STATUS_KEYS.length
      : ACTIVE_STATUS_KEYS.length
    let timer: ReturnType<typeof setTimeout>
    // Rotate slowly and on a varied cadence (~8–12s) so the status reads as
    // genuine progress rather than a distractingly fast ticker.
    const scheduleNext = () => {
      timer = setTimeout(
        () => {
          setStatusIndex((index) => (index + 1) % statusCount)
          scheduleNext()
        },
        8_000 + Math.random() * 4_000
      )
    }
    scheduleNext()
    return () => clearTimeout(timer)
  }, [reconnecting])

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <NotesImportAvatar working />
      <View style={{ flex: 1, gap: 10, paddingTop: 1 }}>
        <View style={{ gap: 2 }}>
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {i18n.t('notesImport')}
          </Text>
          <ShimmerText
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
            }}
          >
            {i18n.t(statusKeys[statusIndex % statusKeys.length])}
          </ShimmerText>
        </View>

        {leaveHint && (showLeaveHint || reconnecting) ? (
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: 18,
            }}
          >
            {i18n.t('notesImport_leaveHint')}
          </Text>
        ) : null}

        {showInferenceStats ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <LucideIcon
              icon={TimerIcon}
              size={11}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('xs'),
                fontVariant: ['tabular-nums'],
              }}
            >
              {`${elapsedSec.toFixed(1)}s · ~${formatTokens(tokens ?? 0)} tok`}
            </Text>
            {__DEV__ ? (
              <View
                style={{
                  backgroundColor: theme.colors.accentTranslucent,
                  borderRadius: 4,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.bold,
                    fontSize: 9,
                  }}
                >
                  DEV
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {__DEV__ && reasoning ? (
          <View
            style={{
              borderLeftWidth: 2,
              borderColor: theme.colors.accentTranslucent,
              paddingLeft: 12,
            }}
          >
            <Text
              numberOfLines={2}
              ellipsizeMode='head'
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                lineHeight: 19,
              }}
            >
              {reasoning}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

export default NotesImportThinking
