import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Alert,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import Haptics from '@/lib/haptics'
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  faCircleExclamation,
  faDownload,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { useNotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'
import { useNotesImportSelection } from '@/features/notes-import/hooks/useNotesImportSelection'
import NotesImportHelpSheet from '@/features/notes-import/components/NotesImportHelpSheet'
import NotesImportThinking from '@/features/notes-import/components/NotesImportThinking'
import NotesImportAvatar from '@/features/notes-import/components/NotesImportAvatar'
import NotesImportPreview from '@/features/notes-import/components/NotesImportPreview'
import NotesImportChatInput from '@/features/notes-import/components/NotesImportChatInput'
import { NotesImportRefinementHistory } from '@/features/notes-import/components/NotesImportRefinementComposer'
import NotesImportUsage, {
  type RenderNotesImportSupporterCta,
} from '@/features/notes-import/components/NotesImportUsage'
import { WarningLine } from '@/features/notes-import/components/NotesImportRecordRow'
import {
  highestSeverity,
  isEmptyPreview,
  type NotesImportPreview as Preview,
  type PreviewSelection,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import {
  errorMessageKey,
  notesImportCountsLine,
  unavailableDetail,
} from '@/features/notes-import/lib/notesImportMessages'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'
import type { NotesImportErrorCode } from '@/features/notes-import/lib/notesImportClient'

interface Props {
  renderSupporterCta?: RenderNotesImportSupporterCta
}

/** Stable empty result so the selection hook can run unconditionally. */
const EMPTY_RESULT: NotesImportResult = {
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  publisher: null,
  warnings: [],
  summary: '',
  assistantMessage: '',
}

/**
 * How many of the records the user is about to import still carry an unresolved
 * flag (warning- or error-severity). Drives the confirm-before-import prompt so
 * a user can't silently commit data WWork AI flagged for review. Info-severity
 * notes don't count — they're informational, not something to "take care of".
 */
const selectedFlagCount = (
  preview: Preview,
  selection: PreviewSelection
): number => {
  let count = 0
  for (const rows of [preview.contacts, preview.visits, preview.timeEntries]) {
    for (const row of rows) {
      if (!selection.ids.has(row.id)) continue
      if (row.severity === 'warning' || row.severity === 'error') count++
    }
  }
  if (selection.publisher) {
    const sev = highestSeverity(preview.publisherWarnings)
    if (sev === 'warning' || sev === 'error') count++
  }
  return count
}

/**
 * The single Notes Import surface (ADR 0009). One chat-style screen that runs
 * an import end to end inline — paste → live "WWork AI" progress → reviewable
 * preview → refine → confirm/undo — so the whole flow reads chronologically in
 * one place instead of bouncing the user across screens. Past imports stay in
 * the history list (header action) and reopen here by hash.
 */
const NotesImportComposerScreen = ({ renderSupporterCta }: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const routeHash =
    useRoute<RouteProp<RootStackParamList, 'NotesImportComposer'>>().params
      ?.hash

  const entries = useNotesImportManager((s) => s.entries)
  const runtimes = useNotesImportManager((s) => s.runtimes)
  const credits = useNotesImportManager((s) => s.credits)
  const reconcileWarningsMap = useNotesImportManager((s) => s.reconcileWarnings)
  const submit = useNotesImportManager((s) => s.submit)
  const refine = useNotesImportManager((s) => s.refine)
  const accept = useNotesImportManager((s) => s.accept)
  const markViewed = useNotesImportManager((s) => s.markViewed)
  const undo = useNotesImportManager((s) => s.undo)
  const remove = useNotesImportManager((s) => s.remove)
  const stop = useNotesImportManager((s) => s.stop)
  const retry = useNotesImportManager((s) => s.retry)
  const focus = useNotesImportManager((s) => s.focus)

  // Status probe on screen load: when the proxy reports the feature is down
  // (kill-switch or no healthy provider), surface a banner instead of letting a
  // user paste into a feature that will only reject the import server-side.
  const availability = useNotesImportAvailability()

  const [text, setText] = useState('')
  const [instruction, setInstruction] = useState('')
  // The route's `hash` param is the single source of truth for which import is
  // on screen. The header's History popover swaps it with `setParams` (a param
  // merge, not a screen navigation), so loading a past import never grows the
  // back stack — see NotesImportHeaderActions.
  const activeHash = routeHash ?? null
  const [helpOpen, setHelpOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [committing, setCommitting] = useState(false)
  const scrollRef = useRef<ScrollView | null>(null)
  const inputRef = useRef<TextInput | null>(null)
  const autoScrollRef = useRef(false)
  // Land at the newest message on first layout (and whenever a different import
  // loads), so the screen opens at the bottom of the conversation, not the intro.
  const pendingBottomRef = useRef(true)

  // Hydrates the header's History action and resumes any in-flight imports.
  useFocusEffect(
    useCallback(() => {
      focus()
    }, [focus])
  )

  // Pop the keyboard as soon as a fresh composer settles so the user can paste
  // or type right away. Deferred past the navigation transition (focusing
  // mid-animation gets dropped), and skipped when reopening a past import by
  // hash — the composer input may not even be shown there.
  useFocusEffect(
    useCallback(() => {
      if (routeHash) return
      const task = InteractionManager.runAfterInteractions(() => {
        inputRef.current?.focus()
      })
      return () => task.cancel()
    }, [routeHash])
  )

  // Swapping the active import (history select, New Import, or a fresh submit)
  // resets the per-view scratch: drop any stale refinement text, reveal the
  // newest message rather than the intro, and — when clearing back to a blank
  // composer — refocus the input for an immediate paste.
  useEffect(() => {
    setInstruction('')
    pendingBottomRef.current = true
    if (!routeHash) requestAnimationFrame(() => inputRef.current?.focus())
  }, [routeHash])

  const activeEntry = activeHash
    ? entries.find((entry) => entry.hash === activeHash)
    : undefined
  const runtime = activeHash ? runtimes[activeHash] : undefined
  const reconcileWarnings = activeHash
    ? reconcileWarningsMap[activeHash]
    : undefined
  const promptText = activeEntry?.notesText ?? ''
  // The finalized conversation thread (prior replies + refinements) preceding the
  // live result. Rendered between the pasted-notes bubble and the current turn.
  const history = activeEntry?.history ?? []

  const result = activeEntry?.result ?? EMPTY_RESULT
  const { preview, selection, toggleRow, togglePublisher, setGroup, setRows } =
    useNotesImportSelection(
      result,
      activeHash ?? '',
      activeEntry?.parsedAt ?? 0
    )

  const isWorking = activeEntry?.state === 'working'
  const isReady = activeEntry?.state === 'ready'
  const isDone = activeEntry?.state === 'done'

  // Showing a Ready import on screen — whether opened from history or freshly
  // finished while watching — counts as reviewing it, so clear its unread dot.
  // `parsedAt` in the deps re-marks viewed after a refinement re-parses (which
  // re-arms the dot), and markViewed is a no-op once the row is already viewed.
  useEffect(() => {
    if (activeHash && isReady) markViewed(activeHash)
  }, [activeHash, isReady, activeEntry?.parsedAt, markViewed])
  const errorCode = runtime?.error
  const isPaused = !!runtime?.paused
  // The run is interruptible exactly when it's actively thinking — not while it's
  // showing an error/limit/paused block (those have their own retry/resume CTAs).
  const isCancellable = isWorking && !errorCode && !isPaused

  const emptyPreview = isEmptyPreview(preview)

  const canConfirm =
    !committing && (selection.ids.size > 0 || selection.publisher)
  // A run in flight locks the composer until it settles (or is stopped/edited,
  // both of which end the run and free the input). The composer is also locked
  // while the proxy reports the feature down — there's nothing to send to. The
  // probe is optimistic (available until it definitively reports otherwise), so
  // this never blocks the input while the status check is still in flight.
  const composerDisabled = submitting || isWorking || !availability.available
  const selectedCount = selection.ids.size
  const confirmLabel =
    selectedCount > 0
      ? i18n.t('notesImport_confirmCount', { count: selectedCount })
      : i18n.t('notesImport_confirm')

  // Auto-stick to the newest output only while the model streams; once a result
  // is up the user is reviewing, so a background hydrate must not yank them down.
  autoScrollRef.current = submitting || (isWorking && !errorCode && !isPaused)

  const onRequestUpgrade = () => navigation.navigate('Paywall')

  const onSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return
    Keyboard.dismiss()
    setSubmitting(true)
    let hash: string | null = null
    try {
      hash = await submit(trimmed)
    } finally {
      setSubmitting(false)
    }
    if (!hash) return
    // Point the screen at the new import; the routeHash effect clears scratch.
    navigation.setParams({ hash })
    setText('')
  }

  const onRefine = async () => {
    if (!activeHash) return
    const next = instruction.trim()
    if (!next) return
    const applied = await refine(activeHash, next)
    if (!applied) return
    // The instruction is now an appended turn in the ledger thread (see refine);
    // just clear the composer for the next message.
    setInstruction('')
  }

  const commit = () => {
    if (!activeHash) return
    setCommitting(true)
    // Defer the synchronous store writes a frame so the spinner paints first.
    requestAnimationFrame(() => {
      const ok = accept(activeHash, {
        selection,
        publisherMode: 'fillIfUnset',
      })
      setCommitting(false)
      if (!ok) {
        Alert.alert(
          i18n.t('notesImport_errorTitle'),
          i18n.t('notesImport_error')
        )
      }
    })
  }

  const onAccept = () => {
    if (!activeHash) return
    // Importing records WWork AI flagged is intentional but rarely the user's
    // intent — confirm first so an unresolved flag can't slip in unnoticed.
    const flagged = selectedFlagCount(preview, selection)
    if (flagged > 0) {
      Alert.alert(
        i18n.t('notesImport_flaggedConfirmTitle'),
        i18n.t(
          flagged === 1
            ? 'notesImport_flaggedConfirmBody'
            : 'notesImport_flaggedConfirmBody_plural',
          { count: flagged }
        ),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('notesImport_flaggedConfirmCta'),
            style: 'destructive',
            onPress: commit,
          },
        ]
      )
      return
    }
    commit()
  }

  /**
   * Edit a sent message: clear it — and the reply it produced — from the chat
   * the moment Edit is tapped, and lift its text back into the composer. We
   * tear the import down now (abort + free the server run, forget the row)
   * rather than on resend, so the user edits against a cleared thread instead
   * of one still streaming the old answer. Any earlier imports stay in the
   * history list.
   */
  const editPrompt = () => {
    if (!activeHash) return
    const draft = promptText
    remove(activeHash)
    // Drop the route back to a blank composer; the routeHash effect clears the
    // refine scratch and refocuses. setText below seeds the editable copy.
    navigation.setParams({ hash: undefined })
    setText(draft)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  /** Long-press the prompt bubble: ChatGPT-style Copy / Edit menu. */
  const onPromptLongPress = () => {
    if (!promptText) return
    void Haptics.selection()
    Alert.alert(i18n.t('notesImport_promptMenuTitle'), undefined, [
      {
        text: i18n.t('copy'),
        onPress: () => {
          void Haptics.success()
          void Clipboard.setStringAsync(promptText)
        },
      },
      { text: i18n.t('notesImport_editMessage'), onPress: editPrompt },
      { text: i18n.t('cancel'), style: 'cancel' },
    ])
  }

  // A "WWork AI" message bubble: branded avatar + a short title/body lead-in,
  // with the wider response content rendered full width beneath it.
  const aiHeader = (title: string, body?: string) => (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
      <NotesImportAvatar />
      <View
        style={{
          flexShrink: 1,
          gap: 2,
          backgroundColor: theme.colors.card,
          borderRadius: 20,
          borderBottomLeftRadius: 4,
          borderCurve: 'continuous',
          paddingHorizontal: 14,
          paddingVertical: 11,
        }}
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {i18n.t('notesImport')}
        </Text>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
        {!!body && (
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: 19,
            }}
          >
            {body}
          </Text>
        )}
      </View>
    </View>
  )

  // A standalone "WWork AI" chat message: the model's single conversational
  // note about whole-import assumptions and any clarifying questions. Rendered
  // beneath the import preview so it reads as the assistant's follow-up, not a
  // warnings panel. (Per-record flags still render inline on their rows.)
  const aiMessage = (message: string) => (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
      <NotesImportAvatar />
      <View
        style={{
          flexShrink: 1,
          gap: 3,
          backgroundColor: theme.colors.card,
          borderRadius: 20,
          borderBottomLeftRadius: 4,
          borderCurve: 'continuous',
          paddingHorizontal: 14,
          paddingVertical: 11,
        }}
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {i18n.t('notesImport')}
        </Text>
        <Text style={{ lineHeight: 21 }}>{message}</Text>
      </View>
    </View>
  )

  const limitBlock = () => (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.bold }}>
        {i18n.t('notesImport_limitTitle')}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('notesImport_limitBody')}
      </Text>
      {renderSupporterCta ? (
        renderSupporterCta({ onPress: onRequestUpgrade })
      ) : (
        <ActionButton onPress={onRequestUpgrade}>
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('notesImport_limitCta')}
          </Text>
        </ActionButton>
      )}
    </Card>
  )

  // Pinned top-of-screen notice when the proxy reports the feature is down,
  // appending the operator's detail (e.g. a maintenance window) when present.
  const unavailableBanner = () => {
    const detail = unavailableDetail(availability.reason)
    return (
      <View style={{ paddingHorizontal: 15, paddingTop: 12 }}>
        <Card style={{ backgroundColor: theme.colors.error }}>
          <View
            style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
          >
            <FontAwesomeIcon
              icon={faCircleExclamation}
              size={18}
              // Fixed white on the fixed red — never the theme-flipping inverse,
              // which would go dark (unreadable) on the red in dark mode.
              color='#fff'
            />
            <Text
              style={{
                flex: 1,
                color: '#fff',
                lineHeight: 20,
              }}
            >
              {detail
                ? i18n.t('notesImport_unavailableBannerDetail', { detail })
                : i18n.t('notesImport_unavailableBanner')}
            </Text>
          </View>
        </Card>
      </View>
    )
  }

  const errorBlock = () => (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <FontAwesomeIcon
          icon={faCircleExclamation}
          size={18}
          color={theme.colors.error}
        />
        <Text style={{ flex: 1, color: theme.colors.textAlt }}>
          {i18n.t(
            errorMessageKey(
              errorCode as NotesImportErrorCode
            ) as 'notesImport_error'
          )}
        </Text>
      </View>
      <ActionButton onPress={() => activeHash && retry(activeHash)}>
        <Text
          style={{
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('notesImport_retry')}
        </Text>
      </ActionButton>
    </Card>
  )

  const pausedBlock = () => (
    <Card style={{ gap: 14 }}>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('notesImport_pausedBody')}
      </Text>
      <ActionButton onPress={() => activeHash && retry(activeHash)}>
        <Text
          style={{
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('notesImport_resume')}
        </Text>
      </ActionButton>
    </Card>
  )

  // The active import's AI turn, by state.
  const conversation = () => {
    if (!activeEntry) return null

    let aiTurn: ReactNode = null
    if (isWorking) {
      if (errorCode === 'limit_reached') aiTurn = limitBlock()
      else if (errorCode) aiTurn = errorBlock()
      else if (isPaused) aiTurn = pausedBlock()
      else
        // No inline cancel here — the composer's Send button becomes a Stop
        // button while the run is in flight (see isCancellable below).
        aiTurn = (
          <NotesImportThinking
            reasoning={runtime?.reasoning}
            reconnecting={Boolean(activeEntry.activeRun) && !runtime?.phase}
            startedAt={runtime?.startedAt}
            tokens={runtime?.tokens}
          />
        )
    } else if (isReady) {
      aiTurn = emptyPreview ? (
        <View style={{ gap: 14 }}>
          {aiHeader(i18n.t('notesImport_emptyTitle'))}
          {!!result.assistantMessage && aiMessage(result.assistantMessage)}
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {aiHeader(
            i18n.t('notesImport_chatReadyTitle'),
            i18n.t('notesImport_chatReadyBody')
          )}
          <NotesImportPreview
            preview={preview}
            selection={selection}
            toggleRow={toggleRow}
            togglePublisher={togglePublisher}
            setGroup={setGroup}
            setRows={setRows}
            disabled={committing}
          />
          {/* The import action lives with the preview it commits, so it reads as
              the next step in the conversation and never crowds the composer. */}
          <ActionButton disabled={!canConfirm} onPress={onAccept}>
            <FontAwesomeIcon
              icon={faDownload}
              size={15}
              color={theme.colors.textInverse}
              style={{ marginRight: 10 }}
            />
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.bold,
              }}
            >
              {confirmLabel}
            </Text>
          </ActionButton>
          {/* WWork AI's follow-up: a single conversational note about the
              assumptions it made and anything it needs the user to clarify.
              Sits below the import action so the user can import now and reply
              via the composer to refine. */}
          {!!result.assistantMessage && aiMessage(result.assistantMessage)}
        </View>
      )
    } else if (isDone) {
      aiTurn = (
        <View style={{ gap: 14 }}>
          {aiHeader(
            i18n.t('notesImport_chatImportedTitle'),
            i18n.t('notesImport_chatImportedBody')
          )}
          <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 20 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {i18n.t('notesImport_success')}
            </Text>
            {activeEntry.result && (
              <Text style={{ color: theme.colors.textAlt }}>
                {notesImportCountsLine(activeEntry.result)}
              </Text>
            )}
            <Button
              onPress={() => activeHash && undo(activeHash)}
              noTransform
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <FontAwesomeIcon
                icon={faRotateLeft}
                size={14}
                color={theme.colors.accent}
              />
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('notesImport_undo')}
              </Text>
            </Button>
          </Card>

          {reconcileWarnings && reconcileWarnings.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Text style={{ fontFamily: theme.fonts.semiBold }}>
                {i18n.t('notesImport_reconcileWarningsTitle')}
              </Text>
              {reconcileWarnings.map((w) => (
                <WarningLine key={w.id} warning={w} />
              ))}
            </Card>
          )}
        </View>
      )
    }

    return (
      <View style={{ gap: 18 }}>
        {/* Persistent chat header: the usage meter, available the whole
            conversation (not just at review time). Deleting an import now lives
            in the history view's per-row menu, not here. */}
        {credits && (
          <NotesImportUsage
            compact
            credits={credits}
            onRequestUpgrade={onRequestUpgrade}
            renderSupporterCta={renderSupporterCta}
          />
        )}

        {/* Your message: the pasted notes. Long-press to copy or edit & resend. */}
        <Pressable
          onLongPress={onPromptLongPress}
          delayLongPress={300}
          accessibilityRole='button'
          accessibilityLabel={promptText}
          accessibilityHint={i18n.t('notesImport_promptMenuTitle')}
          style={{
            alignSelf: 'flex-end',
            maxWidth: '86%',
            borderRadius: 20,
            borderBottomRightRadius: 4,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.accentBubble,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          {/* Show the message in full — never clip the user's own input. When a
              reply or progress update streams in below, the scroll view's
              auto-scroll brings the AI turn into view (see autoScrollRef). */}
          <Text
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSize('md'),
              lineHeight: 21,
            }}
          >
            {promptText}
          </Text>
        </Pressable>

        {/* The conversation thread: every prior turn, oldest first. Each
            superseded AI reply renders as its message bubble (its import cards
            are gone — only the live turn below stays interactive) and each
            refinement renders as a user bubble, so a multi-round refine reads
            top-to-bottom as a real chat rather than collapsing to the latest
            turn. Persisted on the ledger entry, so it survives app restarts. */}
        {history.map((message, index) =>
          message.role === 'assistant' ? (
            <Fragment key={`${index}-a`}>{aiMessage(message.text)}</Fragment>
          ) : (
            <NotesImportRefinementHistory
              key={`${index}-u`}
              lastAppliedInstruction={message.text}
              refining={false}
            />
          )
        )}

        {aiTurn}
      </View>
    )
  }

  // One footer input drives both modes. When a non-empty preview is ready it
  // refines that preview; otherwise it starts a new import. A working run
  // disables typing, and an interruptible run swaps Send for Stop.
  const refineMode = isReady && !emptyPreview
  const composerValue = refineMode ? instruction : text
  const setComposerValue = refineMode ? setInstruction : setText
  const onComposerSubmit = refineMode ? onRefine : onSubmit

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior='padding' style={{ flex: 1 }}>
        {!availability.available &&
          !availability.loading &&
          unavailableBanner()}
        <ScrollView
          ref={scrollRef}
          onContentSizeChange={() => {
            if (pendingBottomRef.current) {
              pendingBottomRef.current = false
              scrollRef.current?.scrollToEnd({ animated: false })
              return
            }
            if (autoScrollRef.current)
              scrollRef.current?.scrollToEnd({ animated: true })
          }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 15,
            paddingTop: 20,
            paddingBottom: 16,
            gap: 24,
          }}
          keyboardShouldPersistTaps='handled'
        >
          {/* The intro sits centered in an empty conversation, then disappears
              once the first import is submitted and the chat takes over. */}
          {!activeEntry && (
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('xl'),
                  }}
                >
                  {i18n.t('notesImport_inputLabel')}
                </Text>
                <Button
                  onPress={() => setHelpOpen(true)}
                  accessibilityRole='button'
                  style={{ paddingVertical: 5 }}
                >
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t('notesImport_howToUse')}
                  </Text>
                </Button>
              </View>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('md'),
                  lineHeight: 21,
                }}
              >
                {i18n.t('notesImport_description')}
              </Text>
            </View>
          )}

          {conversation()}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 15,
            paddingTop: 10,
            paddingBottom: 12,
            backgroundColor: theme.colors.background,
          }}
        >
          <NotesImportChatInput
            ref={inputRef}
            value={composerValue}
            onChangeText={setComposerValue}
            onSubmit={onComposerSubmit}
            editable={!composerDisabled}
            placeholder={
              refineMode
                ? i18n.t('notesImport_refinePlaceholder')
                : // Once the notes are submitted and the run is in flight, the
                  // paste prompt is stale — drop it rather than invite a re-paste.
                  composerDisabled
                  ? ''
                  : i18n.t('notesImport_placeholder')
            }
            accessibilityLabel={
              refineMode
                ? i18n.t('notesImport_refineTitle')
                : i18n.t('notesImport_inputLabel')
            }
            accessibilityHint={
              refineMode
                ? i18n.t('notesImport_refineDescription')
                : i18n.t('notesImport_inputHint')
            }
            submitAccessibilityLabel={
              refineMode
                ? i18n.t('notesImport_refine')
                : i18n.t('notesImport_submit')
            }
            onStop={
              // Stop ends the run for good (terminal `stopped` state) — no pause,
              // no resume prompt. The notes stay; the composer frees up after.
              isCancellable && activeHash ? () => stop(activeHash) : undefined
            }
            stopAccessibilityLabel={i18n.t('cancel')}
          />
        </View>

        <NotesImportHelpSheet open={helpOpen} setOpen={setHelpOpen} />
      </KeyboardAvoidingView>
    </Wrapper>
  )
}

export default NotesImportComposerScreen
