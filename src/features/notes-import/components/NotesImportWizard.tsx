import { useEffect, useState } from 'react'
import { Alert, TextInput, View } from 'react-native'
import { Spinner } from 'tamagui'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import {
  faCircleExclamation,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { PublisherImportMode } from '@/lib/import/writeMappedData'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { useNotesImportSelection } from '@/features/notes-import/hooks/useNotesImportSelection'
import NotesImportPreview from '@/features/notes-import/components/NotesImportPreview'
import NotesImportDataHandling from '@/features/notes-import/components/NotesImportDataHandling'
import NotesImportHelpSheet from '@/features/notes-import/components/NotesImportHelpSheet'
import NotesImportRefinementComposer from '@/features/notes-import/components/NotesImportRefinementComposer'
import NotesImportThinking from '@/features/notes-import/components/NotesImportThinking'
import NotesImportUsage, {
  type RenderNotesImportSupporterCta,
} from '@/features/notes-import/components/NotesImportUsage'
import { isEmptyPreview } from '@/features/notes-import/lib/buildNotesImportPreview'
import { errorMessageKey } from '@/features/notes-import/lib/notesImportMessages'
import type { NotesImportErrorCode } from '@/features/notes-import/lib/notesImportClient'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'

interface Props {
  publisherMode: PublisherImportMode
  /** Hide the in-component title/description (host already shows a header). */
  compact?: boolean
  /** Called when the user finishes (acknowledges success / done). */
  onComplete?: () => void
  /** Shown as the CTA when the free import limit is hit; omit to hide it. */
  onRequestUpgrade?: () => void
  /**
   * App-tier renderer keeps the Supporter feature dependency out of this
   * feature.
   */
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
 * The onboarding "paste your notes" wizard. A single-shot, card-based flow —
 * input → live progress → reviewable preview (refine) → success — for importing
 * one batch of notes during onboarding.
 *
 * It drives the shared multi-import manager store (ADR 0009/0010):
 * submit/refine /accept/undo all run through the same engine the composer
 * screen uses, so an onboarding import inherits Reconcile-at-Accept and
 * crash-resume rather than the (now-removed) single-import fork. Only ONE
 * import is surfaced at a time, tracked by `activeHash`; the manager's history
 * list/queue is invisible here.
 */
const NotesImportWizard = ({
  publisherMode,
  compact,
  onComplete,
  onRequestUpgrade,
  renderSupporterCta,
}: Props) => {
  const theme = useTheme()

  const entries = useNotesImportManager((s) => s.entries)
  const runtimes = useNotesImportManager((s) => s.runtimes)
  const credits = useNotesImportManager((s) => s.credits)
  const submit = useNotesImportManager((s) => s.submit)
  const refine = useNotesImportManager((s) => s.refine)
  const accept = useNotesImportManager((s) => s.accept)
  const undo = useNotesImportManager((s) => s.undo)
  const remove = useNotesImportManager((s) => s.remove)
  const cancel = useNotesImportManager((s) => s.cancel)
  const retry = useNotesImportManager((s) => s.retry)
  const focus = useNotesImportManager((s) => s.focus)

  // The single import this wizard is showing. Set from `await submit(text)`; the
  // manager's other rows (queue/history) are never surfaced here.
  const [activeHash, setActiveHash] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [lastAppliedInstruction, setLastAppliedInstruction] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [committing, setCommitting] = useState(false)

  // Hydrate the store and resume any in-flight import on mount (mirrors the
  // composer's useFocusEffect(focus)).
  useEffect(() => {
    focus()
  }, [focus])

  const activeEntry = activeHash
    ? entries.find((entry) => entry.hash === activeHash)
    : undefined
  const runtime = activeHash ? runtimes[activeHash] : undefined

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
  const errorCode = runtime?.error ?? null
  const isPaused = !!runtime?.paused
  // A Working row that still carries a prior result is a refinement in flight —
  // `beginWorkingEntry` preserves the result, so a fresh submit has none yet.
  // Errors/pauses fall through to their own blocks (with retry/resume).
  const refining = isWorking && !!activeEntry?.result && !errorCode && !isPaused

  const emptyPreview = isEmptyPreview(preview)

  const canConfirm =
    !committing && (selection.ids.size > 0 || selection.publisher)

  const onSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    let hash: string | null = null
    try {
      hash = await submit(trimmed)
    } finally {
      setSubmitting(false)
    }
    if (hash) setActiveHash(hash)
  }

  const applyRefinement = async () => {
    if (!activeHash) return
    const next = instruction.trim()
    if (!next) return
    const applied = await refine(activeHash, next)
    if (!applied) return
    setLastAppliedInstruction(next)
    setInstruction('')
  }

  const commit = () => {
    if (!activeHash) return
    setCommitting(true)
    // Defer the synchronous store writes a frame so the spinner paints first
    // (mirrors the composer + MyTime/iCloud commit paths).
    requestAnimationFrame(() => {
      const ok = accept(activeHash, { selection, publisherMode })
      setCommitting(false)
      if (!ok) {
        Alert.alert(
          i18n.t('notesImport_errorTitle'),
          i18n.t('notesImport_error')
        )
      }
    })
  }

  /** Forget the active import and return to a blank-ish input. */
  const discard = () => {
    if (activeHash) remove(activeHash)
    setActiveHash(null)
    setInstruction('')
    setLastAppliedInstruction('')
  }

  /** Done with this import — clear everything for a fresh paste. */
  const importAnother = () => {
    setActiveHash(null)
    setText('')
    setInstruction('')
    setLastAppliedInstruction('')
  }

  const inputArea = (
    <View style={{ gap: 20 }}>
      {!compact && (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('2xl'),
            }}
          >
            {i18n.t('notesImport_title')}
          </Text>
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

      <Card
        style={{
          gap: 0,
          paddingHorizontal: 0,
          paddingVertical: 0,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingHorizontal: 18,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('notesImport_inputLabel')}
          </Text>
          <Button
            onPress={() => setHelpOpen(true)}
            accessibilityRole='button'
            style={{ paddingVertical: 4 }}
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
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          accessibilityLabel={i18n.t('notesImport_inputLabel')}
          accessibilityHint={i18n.t('notesImport_inputHint')}
          placeholder={i18n.t('notesImport_placeholder')}
          placeholderTextColor={theme.colors.textAlt}
          style={{
            minHeight: 180,
            textAlignVertical: 'top',
            color: theme.colors.text,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize('lg'),
            lineHeight: 23,
            padding: 18,
          }}
        />
        <View
          style={{
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('notesImport_reviewNotice')}
          </Text>
        </View>
      </Card>

      <ActionButton disabled={!text.trim() || submitting} onPress={onSubmit}>
        <Text
          style={{
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('notesImport_submit')}
        </Text>
      </ActionButton>

      {credits && (
        <NotesImportUsage
          credits={credits}
          onRequestUpgrade={onRequestUpgrade}
          renderSupporterCta={renderSupporterCta}
        />
      )}

      <NotesImportDataHandling />

      <NotesImportHelpSheet open={helpOpen} setOpen={setHelpOpen} />
    </View>
  )

  const loadingCard = (label: string) => (
    <Card
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingVertical: 32,
      }}
    >
      <Spinner size='large' color={theme.colors.accent} />
      <Text style={{ color: theme.colors.textAlt }}>{label}</Text>
    </Card>
  )

  const startOverLink = (
    <Button
      onPress={discard}
      style={{ alignSelf: 'center', paddingVertical: 8 }}
    >
      <Text
        style={{
          color: theme.colors.textAlt,
          textDecorationLine: 'underline',
        }}
      >
        {i18n.t('notesImport_startOver')}
      </Text>
    </Button>
  )

  const limitCard = (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.bold }}>
        {i18n.t('notesImport_limitTitle')}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('notesImport_limitBody')}
      </Text>
      {onRequestUpgrade &&
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

  const errorCard = (
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

  const pausedCard = (
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

  // Live model activity; the result still arrives only on completion.
  const streamingCard = (
    <Card style={{ gap: 18, paddingVertical: 24 }}>
      <NotesImportThinking
        reasoning={runtime?.reasoning}
        reconnecting={Boolean(activeEntry?.activeRun) && !runtime?.phase}
        startedAt={runtime?.startedAt}
        tokens={runtime?.tokens}
      />
      <Button
        onPress={() => activeHash && cancel(activeHash)}
        style={{ alignSelf: 'center', paddingVertical: 6 }}
      >
        <Text
          style={{
            color: theme.colors.textAlt,
            textDecorationLine: 'underline',
          }}
        >
          {i18n.t('cancel')}
        </Text>
      </Button>
    </Card>
  )

  // A fresh import in flight (no prior result): live progress, or an in-place
  // error/limit/paused block with its own retry/resume CTA.
  const workingArea = (
    <View style={{ gap: 24 }}>
      {credits && (
        <NotesImportUsage
          credits={credits}
          onRequestUpgrade={onRequestUpgrade}
          renderSupporterCta={renderSupporterCta}
        />
      )}
      {errorCode === 'limit_reached'
        ? limitCard
        : errorCode
          ? errorCard
          : isPaused
            ? pausedCard
            : streamingCard}
      {(!!errorCode || isPaused) && startOverLink}
    </View>
  )

  const previewArea = (
    <View style={{ gap: 16 }}>
      {!compact && (
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('notesImport_previewTitle')}
        </Text>
      )}

      {emptyPreview ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.bold }}>
            {i18n.t('notesImport_emptyTitle')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('notesImport_emptyBody')}
          </Text>
        </Card>
      ) : (
        <>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('notesImport_previewDescription')}
          </Text>
          {credits && (
            <NotesImportUsage
              credits={credits}
              onRequestUpgrade={onRequestUpgrade}
              renderSupporterCta={renderSupporterCta}
            />
          )}
          <NotesImportPreview
            preview={preview}
            selection={selection}
            toggleRow={toggleRow}
            togglePublisher={togglePublisher}
            setGroup={setGroup}
            setRows={setRows}
            disabled={refining}
          />

          <NotesImportRefinementComposer
            instruction={instruction}
            lastAppliedInstruction={lastAppliedInstruction}
            refining={refining}
            onChangeInstruction={setInstruction}
            onSubmit={applyRefinement}
          />

          <ActionButton disabled={!canConfirm || refining} onPress={commit}>
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('notesImport_confirm')}
            </Text>
          </ActionButton>
        </>
      )}

      {startOverLink}
    </View>
  )

  const successArea = (
    <Card style={{ gap: 16, alignItems: 'center', paddingVertical: 24 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>
        {i18n.t('notesImport_success')}
      </Text>
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
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <Button onPress={importAnother}>
          <Text
            style={{
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('notesImport_importAnother')}
          </Text>
        </Button>
        {onComplete && (
          <Button onPress={onComplete}>
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('done')}
            </Text>
          </Button>
        )}
      </View>
    </Card>
  )

  const body = committing
    ? loadingCard(i18n.t('mytimeImport_importing'))
    : isDone
      ? successArea
      : isReady
        ? previewArea
        : isWorking
          ? refining
            ? previewArea
            : workingArea
          : inputArea

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ gap: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps='handled'
    >
      {body}
    </KeyboardAwareScrollView>
  )
}

export default NotesImportWizard
