import type { ReactNode, RefObject } from 'react'
import { Alert, ScrollView, useWindowDimensions, View } from 'react-native'
import { Spinner } from 'tamagui'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons/faCircleCheck'
import { faCirclePause } from '@fortawesome/free-solid-svg-icons/faCirclePause'
import { faCircleStop } from '@fortawesome/free-solid-svg-icons/faCircleStop'
import { faClock } from '@fortawesome/free-solid-svg-icons/faClock'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons/faTrashCan'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'
import { type IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import AnchoredPopover, {
  type ResolveAnchorPosition,
} from '@/components/ui/AnchoredPopover'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import type { ImportRuntime } from '@/features/notes-import/lib/notesImportManagerLogic'
import {
  ledgerEntryTitle,
  isUnviewedReady,
  type NotesImportLedgerEntry,
} from '@/features/notes-import/lib/notesImportLedger'
import { notesImportCountsLine } from '@/features/notes-import/lib/notesImportMessages'
import { formatRelative } from '@/lib/dates'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'

/**
 * An import is "in progress" while its row is Working and not blocked on an
 * error or a user pause — i.e. running, queued, or reconnecting. This is the
 * signal behind the yellow indicator and the in-progress count.
 */
export const isInProgress = (
  entry: NotesImportLedgerEntry,
  runtime: ImportRuntime | undefined
): boolean => entry.state === 'working' && !runtime?.error && !runtime?.paused

export interface NotesImportHistorySummary {
  /** Imports awaiting Accept (Ready), whether or not they've been viewed. */
  readyCount: number
  /** Unread Ready imports — drives the blue unread dot. */
  unviewedCount: number
  /** Imports actively working (running/queued/reconnecting). */
  inProgressCount: number
  hasDone: boolean
  total: number
}

/** One pass over the ledger for the counts the triggers + popover header need. */
export const useNotesImportHistorySummary = (): NotesImportHistorySummary => {
  const entries = useNotesImportManager((s) => s.entries)
  const runtimes = useNotesImportManager((s) => s.runtimes)
  let readyCount = 0
  let unviewedCount = 0
  let inProgressCount = 0
  let hasDone = false
  for (const entry of entries) {
    if (entry.state === 'ready') readyCount += 1
    if (isUnviewedReady(entry)) unviewedCount += 1
    if (isInProgress(entry, runtimes[entry.hash])) inProgressCount += 1
    if (entry.state === 'done') hasDone = true
  }
  return {
    readyCount,
    unviewedCount,
    inProgressCount,
    hasDone,
    total: entries.length,
  }
}

interface StatusVisual {
  label: string
  color: string
  icon: IconDefinition | null
  spinner?: boolean
  readyDot?: boolean
}

const useStatusVisual = (
  entry: NotesImportLedgerEntry,
  runtime: ImportRuntime | undefined
): StatusVisual => {
  const theme = useTheme()
  if (entry.state === 'done') {
    return {
      label: i18n.t('notesImport_stateDone'),
      color: theme.colors.accent,
      icon: faCircleCheck,
    }
  }
  if (entry.state === 'ready') {
    return {
      label: i18n.t('notesImport_stateReady'),
      color: theme.colors.info,
      icon: null,
      // Only an unread Ready row gets the dot; once reviewed it stays Ready
      // (still awaiting Accept) but drops the new-result indicator.
      readyDot: isUnviewedReady(entry),
    }
  }
  if (entry.state === 'stopped') {
    return {
      label: i18n.t('notesImport_stateStopped'),
      color: theme.colors.textAlt,
      icon: faCircleStop,
    }
  }
  // Working sub-states.
  if (runtime?.error) {
    return {
      label: i18n.t('notesImport_stateError'),
      color: theme.colors.error,
      icon: faTriangleExclamation,
    }
  }
  if (runtime?.paused) {
    return {
      label: i18n.t('notesImport_subPaused'),
      color: theme.colors.textAlt,
      icon: faCirclePause,
    }
  }
  if (runtime?.running) {
    return {
      label: i18n.t('notesImport_subRunning'),
      color: theme.colors.textAlt,
      icon: null,
      spinner: true,
    }
  }
  return {
    label: i18n.t('notesImport_subQueued'),
    color: theme.colors.textAlt,
    icon: faClock,
  }
}

interface RowProps {
  entry: NotesImportLedgerEntry
  runtime: ImportRuntime | undefined
  active: boolean
  onPress: () => void
  onDelete: () => void
}

/** A compact history row inside the popover: tap to load, trash to delete. */
const HistoryRow = ({
  entry,
  runtime,
  active,
  onPress,
  onDelete,
}: RowProps) => {
  const theme = useTheme()
  const status = useStatusVisual(entry, runtime)
  const title = ledgerEntryTitle(entry) || i18n.t('notesImport_newImport')
  const counts = entry.result ? notesImportCountsLine(entry.result) : ''
  const relativeTime = formatRelative(entry.updatedAt)

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: active ? theme.colors.accentTranslucent : undefined,
      }}
    >
      <Button
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={`${title}. ${status.label}.${counts ? ` ${counts}.` : ''} ${relativeTime}.`}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
          paddingLeft: 10,
          paddingRight: 6,
        }}
      >
        <View
          style={{ width: 20, alignItems: 'center', justifyContent: 'center' }}
        >
          {status.spinner ? (
            <Spinner size='small' color={theme.colors.accent} />
          ) : status.readyDot ? (
            <NotesImportReadyDot visible size={9} />
          ) : status.icon ? (
            <FontAwesomeIcon
              icon={status.icon}
              size={16}
              color={status.color}
            />
          ) : null}
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {title}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('xs'),
              }}
            >
              {relativeTime}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{ color: status.color, fontSize: theme.fontSize('xs') }}
          >
            {status.label}
            {counts ? ` · ${counts}` : ''}
          </Text>
        </View>
      </Button>

      <Button
        onPress={onDelete}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('delete')}
        hitSlop={6}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FontAwesomeIcon
          icon={faTrashCan}
          size={14}
          color={theme.colors.textAlt}
        />
      </Button>
    </View>
  )
}

interface Props {
  /**
   * Renders the press target. Receives the same `{ onPress, anchorRef }` as
   * AnchoredPopover — attach the ref to a `collapsable={false}` View.
   */
  renderTrigger: (props: {
    onPress: () => void
    anchorRef: RefObject<View | null>
  }) => ReactNode
  /** Open downward (header, default) or upward (a low chat callout). */
  openDirection?: 'down' | 'up'
  /** Horizontal alignment of the content under/over the trigger. */
  align?: 'left' | 'right'
}

/**
 * The Notes Import history popover (ADR 0009): the list of past + in-flight
 * imports, with a ready/in-progress summary and a clear-completed action.
 * Selecting a row loads it into the composer **in place** via a route param
 * merge (`setParams`) — never a screen navigation — so swapping imports never
 * grows the back stack.
 *
 * Extracted so both the header clock button and the composer's bottom callout
 * open the same popover; each supplies its own trigger and open direction.
 */
const NotesImportHistoryPopover = ({
  renderTrigger,
  openDirection = 'down',
  align = 'right',
}: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const activeHash =
    useRoute<RouteProp<RootStackParamList, 'NotesImportComposer'>>().params
      ?.hash ?? null
  const { width } = useWindowDimensions()
  const entries = useNotesImportManager((s) => s.entries)
  const runtimes = useNotesImportManager((s) => s.runtimes)
  const remove = useNotesImportManager((s) => s.remove)
  const clearCompleted = useNotesImportManager((s) => s.clearCompleted)
  const { readyCount, inProgressCount, hasDone } =
    useNotesImportHistorySummary()
  const popoverWidth = Math.min(width - 24, 380)

  const open = (hash: string) => navigation.setParams({ hash })

  const resolvePosition: ResolveAnchorPosition = ({
    anchor,
    windowWidth,
    windowHeight,
    contentWidth,
  }) => {
    const margin = 12
    const preferredLeft =
      align === 'right' ? anchor.x + anchor.width - contentWidth : anchor.x
    const left = Math.min(
      Math.max(margin, preferredLeft),
      windowWidth - contentWidth - margin
    )
    if (openDirection === 'up') {
      // Pin the popover's bottom just above the trigger so it grows upward.
      return { bottom: windowHeight - anchor.y + 6, left }
    }
    return { top: anchor.y + anchor.height + 6, left }
  }

  const confirmDelete = (hash: string) => {
    Alert.alert(
      i18n.t('notesImport_deleteConfirmTitle'),
      i18n.t('notesImport_deleteConfirmBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('notesImport_delete'),
          style: 'destructive',
          onPress: () => remove(hash),
        },
      ]
    )
  }

  const confirmClearCompleted = () => {
    Alert.alert(
      i18n.t('notesImport_clearCompletedConfirmTitle'),
      i18n.t('notesImport_clearCompletedConfirmBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('notesImport_clearCompleted'),
          style: 'destructive',
          onPress: clearCompleted,
        },
      ]
    )
  }

  const summaryLine = (
    color: string,
    label: string,
    dotColor?: string
  ): ReactNode => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 6,
        paddingTop: 2,
      }}
    >
      <NotesImportReadyDot visible color={dotColor} />
      <Text
        style={{
          color,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
    </View>
  )

  return (
    <AnchoredPopover
      contentWidth={popoverWidth}
      contentStyle={{ padding: 8, backgroundColor: theme.colors.background }}
      resolvePosition={resolvePosition}
      renderTrigger={renderTrigger}
    >
      {({ close }) => (
        <View style={{ gap: 6 }}>
          {inProgressCount > 0 &&
            summaryLine(
              theme.colors.warnText,
              i18n.t('notesImport_inProgressCount', { count: inProgressCount }),
              theme.colors.warn
            )}
          {readyCount > 0 &&
            summaryLine(
              theme.colors.textAlt,
              i18n.t('notesImport_readyCount', { count: readyCount })
            )}

          <ScrollView
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ gap: 2 }}
            showsVerticalScrollIndicator={false}
          >
            {entries.map((entry) => (
              <HistoryRow
                key={entry.hash}
                entry={entry}
                runtime={runtimes[entry.hash]}
                active={entry.hash === activeHash}
                onPress={() => {
                  close()
                  open(entry.hash)
                }}
                onDelete={() => confirmDelete(entry.hash)}
              />
            ))}
          </ScrollView>

          {hasDone && (
            <Button
              onPress={confirmClearCompleted}
              style={{ alignSelf: 'center', paddingVertical: 8 }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  textDecorationLine: 'underline',
                }}
              >
                {i18n.t('notesImport_clearCompleted')}
              </Text>
            </Button>
          )}
        </View>
      )}
    </AnchoredPopover>
  )
}

export default NotesImportHistoryPopover
