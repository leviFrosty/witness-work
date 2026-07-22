import {
  CircleAlert as CircleAlertIcon,
  Download as DownloadIcon,
  History as HistoryIcon,
  RotateCcw as RotateCcwIcon,
  Sparkles as SparklesIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
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
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import LottieView from 'lottie-react-native'
import Haptics from '@/lib/haptics'
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { useNotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'
import { useNotesImportSelection } from '@/features/notes-import/hooks/useNotesImportSelection'
import NotesImportHelpSheet from '@/features/notes-import/components/NotesImportHelpSheet'
import NotesImportThinking from '@/features/notes-import/components/NotesImportThinking'
import NotesImportAvatar from '@/features/notes-import/components/NotesImportAvatar'
import NotesImportPreview from '@/features/notes-import/components/NotesImportPreview'
import NotesImportChatInput from '@/features/notes-import/components/NotesImportChatInput'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'
import NotesImportHistoryPopover, {
  isInProgress,
} from '@/features/notes-import/components/NotesImportHistoryPopover'
import { useOnboardingHandoff } from '@/stores/onboardingHandoff'
import {
  NotesImportRefinementBubble,
  NotesImportRefinementMeta,
  notesImportUserBubbleStyle,
} from '@/features/notes-import/components/NotesImportRefinementBubble'
import NotesImportUsage, {
  type RenderNotesImportSupporterCta,
} from '@/features/notes-import/components/NotesImportUsage'
import { WarningLine } from '@/features/notes-import/components/NotesImportRecordRow'
import {
  highestSeverity,
  isEmptyPreview,
  selectMappedImport,
  type NotesImportPreview as Preview,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import {
  errorMessageKey,
  notesImportCommitCountsLine,
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
 * a user can't silently commit data Scribe AI flagged for review. Info-severity
 * notes don't count — they're informational, not something to "take care of".
 *
 * Counts only rows that will ACTUALLY commit (`committedIds` is the id set from
 * `selectMappedImport`), so a warning on a visit whose contact was deselected —
 * and therefore dropped at commit — never triggers the prompt for a record that
 * won't import.
 */
const selectedFlagCount = (
  preview: Preview,
  committedIds: Set<string>,
  publisherCommitted: boolean
): number => {
  let count = 0
  for (const rows of [preview.contacts, preview.visits, preview.timeEntries]) {
    for (const row of rows) {
      if (!committedIds.has(row.id)) continue
      if (row.severity === 'warning' || row.severity === 'error') count++
    }
  }
  if (publisherCommitted) {
    const sev = highestSeverity(preview.publisherWarnings)
    if (sev === 'warning' || sev === 'error') count++
  }
  return count
}

/**
 * The single Notes Import surface (ADR 0009). One chat-style screen that runs
 * an import end to end inline — paste → live "Scribe AI" progress → reviewable
 * preview → refine → confirm/undo — so the whole flow reads chronologically in
 * one place instead of bouncing the user across screens. Past imports stay in
 * the history list (header action) and reopen here by hash.
 */
const NotesImportComposerScreen = ({ renderSupporterCta }: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const route = useRoute<RouteProp<RootStackParamList, 'NotesImportComposer'>>()
  const routeHash = route.params?.hash
  // Launched from the onboarding "From Notes" step: after a while we offer a
  // "continue setup" handoff so a slow import never blocks onboarding.
  const fromOnboarding = route.params?.fromOnboarding ?? false

  const entries = useNotesImportManager((s) => s.entries)
  const runtimes = useNotesImportManager((s) => s.runtimes)
  const globalCredits = useNotesImportManager((s) => s.credits)
  const creditsForImport = useNotesImportManager((s) => s.creditsForImport)
  const reconcileWarningsMap = useNotesImportManager((s) => s.reconcileWarnings)
  const submit = useNotesImportManager((s) => s.submit)
  const refine = useNotesImportManager((s) => s.refine)
  const interruptAndRefine = useNotesImportManager((s) => s.interruptAndRefine)
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

  // A single draft buffer backs the footer input across every mode (new import,
  // refine, interrupt-refine). Keeping ONE source of truth is what fixes
  // follow-up text from vanishing when a reply settles: the input's mode flips
  // (e.g. an empty/errored result swaps refine → new-import), but the buffer it
  // reads never changes, so half-typed text survives the transition.
  const [draft, setDraft] = useState('')
  // The route's `hash` param is the single source of truth for which import is
  // on screen. The header's History popover swaps it with `setParams` (a param
  // merge, not a screen navigation), so loading a past import never grows the
  // back stack — see NotesImportHeaderActions.
  const activeHash = routeHash ?? null
  const credits = activeHash ? creditsForImport(activeHash) : globalCredits
  const [helpOpen, setHelpOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [committing, setCommitting] = useState(false)
  // The hash whose commit just landed in THIS session. Gates the celebratory
  // success screen (animated checkmark + home/import-another CTAs) so it fires
  // only on a fresh import — reopening an already-imported row from history
  // keeps the calmer "already added" card instead of re-celebrating.
  const [celebratedHash, setCelebratedHash] = useState<string | null>(null)
  // Synchronous double-tap latch for commit(): the async `committing` state
  // can't gate a second tap that lands in the same frame (before the re-render),
  // and a second accept would see the row already non-Ready and pop a spurious
  // error even though the first import succeeded.
  const committingRef = useRef(false)
  // Synchronous double-tap latch for the interrupt-and-refine Send: its manager
  // guard (state === 'working') stays true right after it re-opens the row, so —
  // unlike a plain refine, which the ready-state guard naturally blocks — a second
  // tap in the same frame would tear the new run down and duplicate the thread turn.
  const interruptingRef = useRef(false)
  // editPrompt lifts a sent message back into a fresh composer. It stashes the
  // text here so the routeHash reset effect SEEDS the draft with it instead of
  // clearing — the two fire off the same `setParams({ hash: undefined })`.
  const pendingDraftRef = useRef<string | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)
  const inputRef = useRef<TextInput | null>(null)
  const autoScrollRef = useRef(false)
  // Land at the newest message on first layout (and whenever a different import
  // loads), so the screen opens at the bottom of the conversation, not the intro.
  const pendingBottomRef = useRef(true)

  // Keyboard avoidance is driven by hand from the animated keyboard frame:
  // RN's KeyboardAvoidingView never reacts to the keyboard on this screen
  // (new-arch iOS + native-stack), leaving the composer buried behind it. The
  // padding is the keyboard's overlap beyond the bottom safe-area inset that
  // Wrapper already applies, so the footer rides exactly on the keyboard's
  // top edge — including while it animates in/out.
  const keyboard = useAnimatedKeyboard()
  const safeArea = useSafeAreaInsets()
  const keyboardPadding = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value - safeArea.bottom, 0),
  }))

  // Opening the keyboard shrinks the thread's viewport; snap to the newest
  // message so the composer's context (the prompt or latest reply) never hides
  // behind the keyboard — same bottom-anchored behavior as any chat app.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardWillShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true })
    })
    return () => sub.remove()
  }, [])

  // Hydrates the header's History action and resumes any in-flight imports.
  useFocusEffect(
    useCallback(() => {
      focus()
    }, [focus])
  )

  // Pop the keyboard as soon as a fresh composer settles so the user can paste
  // or type right away. Deferred past the navigation transition via the
  // native-stack `transitionEnd` event (focusing mid-animation gets dropped),
  // and skipped when reopening a past import by hash — the composer input may
  // not even be shown there.
  useFocusEffect(
    useCallback(() => {
      if (routeHash) return
      return navigation.addListener('transitionEnd', () => {
        inputRef.current?.focus()
      })
    }, [routeHash, navigation])
  )

  // Swapping the active import (history select, New Import, or a fresh submit)
  // resets the per-view scratch: drop any stale refinement text, reveal the
  // newest message rather than the intro, and — when clearing back to a blank
  // composer — refocus the input for an immediate paste.
  useEffect(() => {
    // editPrompt preloads the box with the message being edited; every other
    // route swap (history select, New Import) clears the per-view draft.
    setDraft(pendingDraftRef.current ?? '')
    pendingDraftRef.current = null
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
  const {
    mapped,
    preview,
    selection,
    toggleRow,
    togglePublisher,
    setGroup,
    setRows,
  } = useNotesImportSelection(
    result,
    activeHash ?? '',
    activeEntry?.parsedAt ?? 0
  )

  const isWorking = activeEntry?.state === 'working'
  const isReady = activeEntry?.state === 'ready'
  const isDone = activeEntry?.state === 'done'
  const isStopped = activeEntry?.state === 'stopped'

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

  // Onboarding handoff: the "From Notes" step pushes this screen, so a slow
  // import can't be left blocking setup. After 15s of a live run, offer a
  // Scribe AI bubble that lets the user continue onboarding; tapping it asks
  // onboarding to advance and pops back to it — the import keeps running and
  // resumes from the ledger.
  const requestContinueOnboarding = useOnboardingHandoff(
    (s) => s.requestContinue
  )
  const [onboardingPromptDue, setOnboardingPromptDue] = useState(false)
  useEffect(() => {
    if (!fromOnboarding) return
    const live = isWorking && !errorCode && !isPaused
    if (!live) {
      setOnboardingPromptDue(false)
      return
    }
    const id = setTimeout(() => setOnboardingPromptDue(true), 15_000)
    return () => clearTimeout(id)
  }, [fromOnboarding, isWorking, errorCode, isPaused, activeHash])

  const continueOnboarding = () => {
    requestContinueOnboarding()
    navigation.goBack()
  }

  // Imports worth jumping to from the bottom callout: anything in progress or
  // ready to review that isn't already the one on screen.
  const actionableOther = entries.filter(
    (entry) =>
      entry.hash !== activeHash &&
      (entry.state === 'ready' || isInProgress(entry, runtimes[entry.hash]))
  )
  const calloutInProgress = actionableOther.some((entry) =>
    isInProgress(entry, runtimes[entry.hash])
  )

  const emptyPreview = isEmptyPreview(preview)

  // The records that will ACTUALLY commit. `selectMappedImport` drops a visit
  // whose new contact is deselected, so the confirm count and the flagged-import
  // prompt must read from this projection — not the raw `selection`, which would
  // count orphaned visits that never write. Equals `selection.ids.size` exactly
  // when nothing is deselected.
  const committed = selectMappedImport(mapped, selection)
  const committedIds = new Set<string>([
    ...committed.contacts.map((c) => c.id),
    ...committed.visits.map((v) => v.id),
    ...committed.timeEntries.map((t) => t.id),
  ])

  const canConfirm =
    !committing && (committedIds.size > 0 || committed.publisher != null)
  // The composer stays editable WHILE the model is thinking (isCancellable), so
  // the user can type a follow-up mid-thought — sending then interrupts the run
  // and re-sends as a refinement. It locks only while a Working run is parked on
  // an error/limit/paused block (those carry their own retry/resume CTAs), during
  // the brief submit handoff, or while the proxy reports the feature down (the
  // probe is optimistic, so this never blocks the input mid-status-check).
  const composerDisabled =
    submitting || !availability.available || (isWorking && !isCancellable)
  const selectedCount = committedIds.size
  const confirmLabel =
    selectedCount > 0
      ? i18n.t('notesImport_confirmCount', { count: selectedCount })
      : i18n.t('notesImport_confirm')

  // Auto-stick to the newest output only while the model streams; once a result
  // is up the user is reviewing, so a background hydrate must not yank them down.
  autoScrollRef.current = submitting || (isWorking && !errorCode && !isPaused)

  const onRequestUpgrade = () => navigation.navigate('Paywall')

  const openHelp = () => {
    inputRef.current?.blur()
    Keyboard.dismiss()
    setHelpOpen(true)
  }

  const onSubmit = async () => {
    const trimmed = draft.trim()
    if (!trimmed || submitting) return
    // After Scribe AI found "nothing to import", a follow-up is almost always
    // more context for the SAME notes, not a brand-new import. Concatenating it
    // onto the original (instead of submitting the follow-up alone) re-parses the
    // combined text together — so the original message is augmented, never
    // replaced. Chains across repeated empty results, since each combined parse
    // becomes the next `promptText`.
    const combineWithEmpty = isReady && emptyPreview && !!promptText
    const text = combineWithEmpty ? `${promptText}\n\n${trimmed}` : trimmed
    Keyboard.dismiss()
    setSubmitting(true)
    let hash: string | null = null
    try {
      hash = await submit(text)
    } finally {
      setSubmitting(false)
    }
    if (!hash) return
    // Point the screen at the new import; the routeHash effect clears scratch.
    navigation.setParams({ hash })
    setDraft('')
  }

  const onRefine = async () => {
    if (!activeHash) return
    const next = draft.trim()
    if (!next) return
    const applied = await refine(activeHash, next)
    if (!applied) return
    // The instruction is now an appended turn in the ledger thread (see refine);
    // just clear the composer for the next message.
    setDraft('')
  }

  // Send mid-thought: stop the in-flight run and re-send the typed text as a
  // fresh refinement. On the rare race where the run just settled, the manager
  // returns false and we keep the text so the user can send it as a plain refine.
  const onInterruptRefine = async () => {
    if (!activeHash || interruptingRef.current) return
    const next = draft.trim()
    if (!next) return
    interruptingRef.current = true
    try {
      const applied = await interruptAndRefine(activeHash, next)
      if (applied) setDraft('')
    } finally {
      interruptingRef.current = false
    }
  }

  const commit = () => {
    if (!activeHash) return
    // Latch synchronously so a fast double-tap can't queue a second accept: the
    // second would see the row already committed (no longer Ready) and pop a
    // misleading error even though the first import succeeded.
    if (committingRef.current) return
    committingRef.current = true
    setCommitting(true)
    // Defer the synchronous store writes a frame so the spinner paints first.
    requestAnimationFrame(() => {
      const ok = accept(activeHash, {
        selection,
        publisherMode: 'fillIfUnset',
      })
      committingRef.current = false
      setCommitting(false)
      if (!ok) {
        Alert.alert(
          i18n.t('notesImport_errorTitle'),
          i18n.t('notesImport_error')
        )
        return
      }
      // Mark this row as freshly committed so the Done turn renders the
      // celebratory success screen, and punctuate the moment with a haptic.
      setCelebratedHash(activeHash)
      void Haptics.success()
    })
  }

  // "Import another": leave the just-committed import in place (it stays
  // imported) and drop the route back to a blank composer for a new session.
  // The routeHash effect clears the refine scratch and refocuses the input.
  const importAnother = () => {
    setCelebratedHash(null)
    // routeHash → undefined runs the reset effect, which clears the draft.
    navigation.setParams({ hash: undefined })
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // "Take me home": pop the whole Notes Import stack back to the home tabs.
  const takeHome = () => navigation.popToTop()

  const onAccept = () => {
    if (!activeHash) return
    // Importing records Scribe AI flagged is intentional but rarely the user's
    // intent — confirm first so an unresolved flag can't slip in unnoticed.
    const flagged = selectedFlagCount(
      preview,
      committedIds,
      committed.publisher != null
    )
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
    const messageDraft = promptText
    // A Done import's commit must be undone before we forget the row: `remove`
    // deletes the ledger row WITHOUT touching committed data, so editing and
    // resending would mint a new content hash → new record ids → the same
    // visits/time entries committed a SECOND time. `undo` deletes exactly what
    // it inserted first, so the edit re-sends against a clean slate.
    if (isDone) undo(activeHash)
    remove(activeHash)
    // Drop the route back to a blank composer. The routeHash reset effect would
    // normally clear the draft; stashing the text in pendingDraftRef makes that
    // same effect seed the editable copy instead, then refocus.
    pendingDraftRef.current = messageDraft
    navigation.setParams({ hash: undefined })
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

  // The shared "Scribe AI" chat-bubble scaffold: branded avatar + a rounded card
  // tagged with the accent "Scribe AI" label, wrapping whatever body the caller
  // supplies. `gap` tunes the inner spacing per bubble kind.
  const aiBubble = (children: ReactNode, gap: number) => (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
      <NotesImportAvatar />
      <View
        style={{
          flexShrink: 1,
          gap,
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
        {children}
      </View>
    </View>
  )

  // A "Scribe AI" message bubble: a short title/body lead-in, with the wider
  // response content rendered full width beneath it.
  const aiHeader = (title: string, body?: string) =>
    aiBubble(
      <>
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
      </>,
      2
    )

  // A standalone "Scribe AI" chat message: the model's single conversational
  // note about whole-import assumptions and any clarifying questions. Rendered
  // beneath the import preview so it reads as the assistant's follow-up, not a
  // warnings panel. (Per-record flags still render inline on their rows.)
  const aiMessage = (message: string) =>
    aiBubble(<Text style={{ lineHeight: 21 }}>{message}</Text>, 3)

  // Onboarding-only follow-up beneath the live thinking indicator: invites the
  // user to keep setting up while a slow import finishes in the background.
  const onboardingContinueBubble = () =>
    aiBubble(
      <View style={{ gap: 12 }}>
        <Text style={{ lineHeight: 21 }}>
          {i18n.t('notesImport_onboardingContinueBody')}
        </Text>
        <ActionButton onPress={continueOnboarding}>
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('notesImport_onboardingContinueCta')}
          </Text>
        </ActionButton>
      </View>,
      3
    )

  const limitBlock = () => {
    const noImports = credits?.limit === 0
    const resetDate = credits?.resetsAt ? formatDate(credits.resetsAt) : null
    const body = noImports
      ? i18n.t('notesImport_limitBodyNone')
      : resetDate
        ? i18n.t('notesImport_limitBodyReset', { date: resetDate })
        : i18n.t('notesImport_limitBodyNoReset')

    return (
      <Card style={{ gap: 10 }}>
        <Text style={{ fontFamily: theme.fonts.bold }}>
          {i18n.t(
            noImports ? 'notesImport_usageNoImports' : 'notesImport_limitTitle'
          )}
        </Text>
        <Text style={{ color: theme.colors.textAlt, lineHeight: 20 }}>
          {body}
        </Text>
        {credits?.isSupporter !== true &&
          (renderSupporterCta ? (
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
          ))}
      </Card>
    )
  }

  const refinementLimitBlock = () =>
    aiHeader(
      i18n.t('notesImport_refinementLimitTitle'),
      i18n.t('notesImport_refinementLimitAction')
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
            <LucideIcon
              icon={CircleAlertIcon}
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
        <LucideIcon
          icon={CircleAlertIcon}
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
      else if (errorCode === 'refinement_limit') {
        aiTurn = refinementLimitBlock()
      } else if (errorCode) aiTurn = errorBlock()
      else if (isPaused) aiTurn = pausedBlock()
      else
        // No inline cancel here — the composer's Send button becomes a Stop
        // button while the run is in flight (see isCancellable below).
        aiTurn = (
          <View style={{ gap: 14 }}>
            <NotesImportThinking
              reasoning={runtime?.reasoning}
              reconnecting={Boolean(activeEntry.activeRun) && !runtime?.phase}
              startedAt={runtime?.startedAt}
              tokens={runtime?.tokens}
              leaveHint={!fromOnboarding}
            />
            {fromOnboarding &&
              onboardingPromptDue &&
              onboardingContinueBubble()}
          </View>
        )
    } else if (isReady) {
      aiTurn = emptyPreview ? (
        <View style={{ gap: 14 }}>
          {aiHeader(i18n.t('notesImport_emptyTitle'))}
          {!!result.assistantMessage && aiMessage(result.assistantMessage)}
          {/* Past the free-empty window, an empty parse still costs a credit
              (ADR 0012). Scribe AI owns the message so the user is told in-voice,
              not via a system banner. Within-window empties leave this false. */}
          {activeEntry.emptyCharged &&
            aiMessage(i18n.t('notesImport_emptyChargedNotice'))}
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
            <LucideIcon
              icon={DownloadIcon}
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
          {/* Scribe AI's follow-up: a single conversational note about the
              assumptions it made and anything it needs the user to clarify.
              Sits below the import action so the user can import now and reply
              via the composer to refine. */}
          {!!result.assistantMessage && aiMessage(result.assistantMessage)}
        </View>
      )
    } else if (isDone) {
      // Show what the commit ACTUALLY inserted (after deselection + reconcile
      // drops), not the full parse — a partial import must never overstate its
      // counts. A Done row always has `commit`; fall back to the parse defensively.
      const countsLine = activeEntry.commit
        ? notesImportCommitCountsLine(activeEntry.commit)
        : activeEntry.result
          ? notesImportCountsLine(activeEntry.result)
          : ''
      // Celebrate only the commit that just landed this session; a Done row
      // reopened from history keeps the calmer "already added" card.
      const justImported = celebratedHash === activeHash

      // Subtle revert affordance — present in both the celebratory and the
      // reopened layouts so a committed import is always undoable from here.
      const undoButton = (
        <Button
          onPress={() => activeHash && undo(activeHash)}
          noTransform
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <LucideIcon
            icon={RotateCcwIcon}
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
      )

      const reconcileCard =
        reconcileWarnings && reconcileWarnings.length > 0 ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {i18n.t('notesImport_reconcileWarningsTitle')}
            </Text>
            {reconcileWarnings.map((w) => (
              <WarningLine key={w.id} warning={w} />
            ))}
          </Card>
        ) : null

      aiTurn = justImported ? (
        // Fresh import: a standard, centered success screen — animated
        // checkmark (the same Lottie as the publisher check-in), the counts,
        // then "import another" (primary) / "take me home" (secondary) CTAs.
        <View style={{ gap: 14 }}>
          <Card style={{ gap: 18, alignItems: 'center', paddingVertical: 28 }}>
            <LottieView
              autoPlay
              loop={false}
              speed={0.875}
              style={{ width: 120, height: 104 }}
              source={require('@/assets/lottie/checkMark.json')}
            />
            <View style={{ gap: 4, alignItems: 'center' }}>
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {i18n.t('notesImport_success')}
              </Text>
              {!!countsLine && (
                <Text style={{ color: theme.colors.textAlt }}>
                  {countsLine}
                </Text>
              )}
            </View>
            <View style={{ alignSelf: 'stretch', gap: 10 }}>
              <ActionButton onPress={importAnother}>
                {i18n.t('notesImport_importAnother')}
              </ActionButton>
              <Button
                onPress={takeHome}
                style={{
                  alignItems: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  borderRadius: theme.numbers.borderRadiusSm,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('notesImport_takeHome')}
                </Text>
              </Button>
            </View>
            {undoButton}
          </Card>
          {reconcileCard}
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {aiHeader(
            i18n.t('notesImport_chatImportedTitle'),
            i18n.t('notesImport_chatImportedBody')
          )}
          <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 20 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {i18n.t('notesImport_success')}
            </Text>
            {!!countsLine && (
              <Text style={{ color: theme.colors.textAlt }}>{countsLine}</Text>
            )}
            {undoButton}
          </Card>
          {reconcileCard}
        </View>
      )
    } else if (isStopped) {
      // A stopped run is terminal but keeps whatever it had parsed. When a
      // (credit-charged) result survived — e.g. the user stopped a refinement of
      // an already-Ready import — keep it on screen as a read-only review so the
      // reviewed preview doesn't vanish; otherwise just note the stop. (Re-importing
      // a stopped result would need a manager change — `accept` only takes a Ready
      // row — so no Import action is offered here; the user can edit & resend.)
      aiTurn =
        activeEntry.result && !emptyPreview ? (
          <View style={{ gap: 14 }}>
            {aiHeader(i18n.t('notesImport_stateStopped'))}
            <NotesImportPreview
              preview={preview}
              selection={selection}
              toggleRow={toggleRow}
              togglePublisher={togglePublisher}
              setGroup={setGroup}
              setRows={setRows}
              disabled
            />
          </View>
        ) : (
          aiHeader(i18n.t('notesImport_stateStopped'))
        )
    }

    // Refinement allowance is intentionally quiet and local to the active chat.
    // Keep one current balance directly beneath the latest Scribe AI turn rather
    // than repeating historical snapshots beneath every user instruction.
    const showRefinementMeta =
      (isReady && !emptyPreview) ||
      (isWorking &&
        !isPaused &&
        (!errorCode || errorCode === 'refinement_limit'))
    const refinementMeta = showRefinementMeta ? (
      <NotesImportRefinementMeta
        remaining={credits?.refinements.remaining}
        limit={credits?.refinements.limit}
      />
    ) : null

    return (
      <View style={{ gap: 18 }}>
        {/* Your message: the pasted notes. Long-press to copy or edit & resend.
            The usage meter that used to lead this thread is now pinned above the
            scroll view, so it stays put as the conversation scrolls. */}
        <Pressable
          onLongPress={onPromptLongPress}
          delayLongPress={300}
          accessibilityRole='button'
          accessibilityLabel={promptText}
          accessibilityHint={i18n.t('notesImport_promptMenuTitle')}
          style={{
            alignSelf: 'flex-end',
            maxWidth: '86%',
            ...notesImportUserBubbleStyle(theme),
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
        {history.map((message, index) => {
          if (message.role === 'assistant') {
            return (
              <Fragment key={`${index}-a`}>{aiMessage(message.text)}</Fragment>
            )
          }
          return (
            <NotesImportRefinementBubble
              key={`${index}-u`}
              instruction={message.text}
            />
          )
        })}

        <View style={{ gap: refinementMeta ? 6 : 0 }}>
          {aiTurn}
          {refinementMeta}
        </View>
      </View>
    )
  }

  // One footer input drives every mode off a single `draft` buffer, so a mode
  // flip never drops half-typed text. The MODE still varies: it's a refine when
  // there's a preview to refine OR the model is mid-thought, otherwise a
  // brand-new import. While thinking the input stays live — an empty field shows
  // Stop, and typing swaps it for Send, which interrupts the run and re-sends the
  // text as a refinement.
  const isThinking = isCancellable
  const refineMode = (isReady && !emptyPreview) || isThinking
  const composerValue = draft
  const setComposerValue = setDraft
  const onComposerSubmit = isThinking
    ? onInterruptRefine
    : refineMode
      ? onRefine
      : onSubmit

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <Animated.View style={[{ flex: 1 }, keyboardPadding]}>
        {!availability.available &&
          !availability.loading &&
          unavailableBanner()}
        <ScrollView
          ref={scrollRef}
          // Must flex — RN 0.86's Yoga no longer clamps an unflexed
          // ScrollView to its parent's bounds, so without this the chat
          // history sizes to its content and pushes the input bar off-screen.
          style={{ flex: 1 }}
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
                gap: 10,
                paddingHorizontal: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <LucideIcon
                  icon={SparklesIcon}
                  size={20}
                  color={theme.colors.accent}
                />
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('xl'),
                  }}
                >
                  {i18n.t('notesImport_inputLabel')}
                </Text>
                <Badge
                  color={theme.colors.accentTranslucent}
                  size='xs'
                  textStyle={{ color: theme.colors.accent }}
                >
                  {i18n.t('beta')}
                </Badge>
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
              <Button
                onPress={openHelp}
                accessibilityRole='button'
                style={{ alignSelf: 'flex-start', paddingVertical: 5 }}
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
              // Only while the field is EMPTY, though: once the user types a
              // follow-up mid-thought the trailing action becomes Send, which
              // interrupts the run and re-sends as a refinement (onInterruptRefine).
              isThinking && activeHash && !composerValue.trim()
                ? () => stop(activeHash)
                : undefined
            }
            stopAccessibilityLabel={i18n.t('cancel')}
            // "View imports" callout sits at the LEFT of the control row — the
            // in-chat entry point to the history list (the header no longer has
            // a clock). Shown whenever any import is saved; opens upward so it
            // clears the keyboard. Its dot lights only when another import is
            // in-flight or ready to review.
            leading={
              entries.length > 0 ? (
                <NotesImportHistoryPopover
                  openDirection='up'
                  align='left'
                  renderTrigger={({ onPress, anchorRef }) => (
                    <View
                      ref={anchorRef}
                      collapsable={false}
                      style={{ flexShrink: 1 }}
                    >
                      <Button
                        onPress={onPress}
                        accessibilityRole='button'
                        accessibilityLabel={i18n.t('notesImport_viewHistory')}
                        noTransform
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 7,
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          borderRadius: theme.numbers.borderRadiusXl,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.card,
                        }}
                      >
                        <NotesImportReadyDot
                          visible={actionableOther.length > 0}
                          color={
                            calloutInProgress ? theme.colors.warn : undefined
                          }
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            flexShrink: 1,
                            color: theme.colors.textAlt,
                            fontFamily: theme.fonts.semiBold,
                            fontSize: theme.fontSize('sm'),
                          }}
                        >
                          {i18n.t('notesImport_viewHistory')}
                        </Text>
                        <LucideIcon
                          icon={HistoryIcon}
                          size={12}
                          color={theme.colors.textAlt}
                        />
                      </Button>
                    </View>
                  )}
                />
              ) : undefined
            }
            // Compact Import Credit balance rides the composer's control row;
            // refinement limits stay in the active conversation instead.
            accessory={
              <NotesImportUsage
                credits={credits}
                onRequestUpgrade={onRequestUpgrade}
                renderSupporterCta={renderSupporterCta}
              />
            }
          />
        </View>

        <NotesImportHelpSheet
          open={helpOpen}
          setOpen={setHelpOpen}
          schedule={availability.schedule}
        />
      </Animated.View>
    </Wrapper>
  )
}

export default NotesImportComposerScreen
