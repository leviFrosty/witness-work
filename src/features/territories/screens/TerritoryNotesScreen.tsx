import { useEffect, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { canScanDocumentText, scanDocumentText } from '@/lib/scanDocumentText'
import { toast } from '@/stores/toasts'
import DoorNotesReview from '@/features/territories/components/DoorNotesReview'
import DoorNotesTextStep from '@/features/territories/components/DoorNotesTextStep'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import useNotesReading from '@/features/territories/hooks/useNotesReading'
import {
  addNoteDoors,
  noteDoorCount,
  notesAuthorName,
  undoNoteDoors,
  type NotesAuthor,
  type NotesUndo,
} from '@/features/territories/lib/addFromNotes'
import {
  entryFromProblem,
  groupKey,
  readyNoteDoors,
} from '@/features/territories/lib/noteReview'
import {
  moveToStreet,
  type NoteEntry,
  type NoteProblem,
} from '@/features/territories/lib/parseDoorNotes'
import {
  NO_NOTES_AI,
  type NotesAi,
  type NotesReader,
} from '@/features/territories/lib/scribeNotes'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryNotes'> & {
  ai?: NotesAi
  meter?: ReactNode
}

const UNDO_KEY = 'territory-notes'

const appendScan = (current: string, scanned: string) =>
  current.trim() ? `${current.trimEnd()}\n${scanned}` : scanned

const readerProps = (reader: NotesReader) =>
  reader.kind === 'scribe'
    ? { reader: 'scribe' }
    : { reader: 'device', reason: reader.reason }

const workedAt = (date: Date) =>
  date.toDateString() === new Date().toDateString()
    ? Date.now()
    : Math.min(date.getTime(), Date.now())

export default function TerritoryNotesScreen({
  route,
  navigation,
  ai = NO_NOTES_AI,
  meter,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId, streetId } = route.params
  const territory = useTerritory(territoryId)
  const update = useTerritories((state) => state.update)
  const privacy = useDoorRecordPrivacy()

  const [reviewing, setReviewing] = useState(false)
  const [text, setText] = useState('')
  const [nothingRead, setNothingRead] = useState<NotesReader | null>(null)
  const [reader, setReader] = useState<NotesReader>({
    kind: 'device',
    reason: 'notOffered',
  })
  const reading = useNotesReading(ai)
  const [entries, setEntries] = useState<NoteEntry[]>([])
  const [problems, setProblems] = useState<NoteProblem[]>([])
  const [date, setDate] = useState(() => new Date())
  const [author, setAuthor] = useState<NotesAuthor>({ kind: 'me' })

  const unavailable =
    !territory || privacy || territory.finishedAt !== undefined
  useEffect(() => {
    if (unavailable) navigation.goBack()
  }, [unavailable, navigation])

  if (!territory || unavailable) return null
  const street = territory.streets.find((had) => had.id === streetId)

  const read = async () => {
    const result = await reading.read(text, {
      streets: territory.streets,
      streetId: street?.id,
    })
    if (!result) return
    const { parsed } = result
    analytics.capture('territory_notes_read', {
      ...readerProps(result.reader),
      entries: parsed.entries.length,
      problems: parsed.unrecognised.length,
    })
    if (parsed.entries.length === 0 && parsed.unrecognised.length === 0)
      return setNothingRead(result.reader)
    setNothingRead(null)
    setReader(result.reader)
    setEntries(parsed.entries)
    setProblems(parsed.unrecognised)
    setReviewing(true)
  }

  const scan = async () => {
    try {
      const scanned = await scanDocumentText()
      const outcome =
        scanned.status === 'scanned' && !scanned.text ? 'empty' : scanned.status
      analytics.capture('territory_notes_scanned', {
        outcome,
        pages: scanned.status === 'scanned' ? scanned.pages : 0,
      })
      if (scanned.status !== 'scanned') return
      if (!scanned.text) {
        toast.info(i18n.t('territories.notes.scanEmpty'))
        return
      }
      setText((current) => appendScan(current, scanned.text))
      setNothingRead(null)
    } catch (error) {
      logger.warn('[territories] notes scan failed', error)
      analytics.capture('territory_notes_scanned', {
        outcome: 'failed',
        pages: 0,
      })
      toast.error(i18n.t('territories.notes.scanFailed'))
    }
  }

  const save = () => {
    const doors = readyNoteDoors(entries)
    if (doors.length === 0) return
    let undo: NotesUndo = { streets: [] }
    update(territoryId, (current) => {
      const result = addNoteDoors(current, doors, {
        at: workedAt(date),
        recordedBy: notesAuthorName(current, author),
        newId: Crypto.randomUUID,
      })
      undo = result.undo
      return result.territory
    })
    const doNotCalls = noteDoorCount(doors, 'doNotCall')
    analytics.capture('territory_notes_added', {
      ...readerProps(reader),
      entries: doors.length,
      do_not_calls: doNotCalls,
    })
    toast.undo({
      key: UNDO_KEY,
      title: i18n.t('territories.notes.added_toast', { count: doors.length }),
      message:
        doNotCalls > 0
          ? i18n.t('territories.notes.added_toastDoNotCalls', {
              count: doNotCalls,
            })
          : undefined,
      onUndo: () =>
        update(territoryId, (current) => undoNoteDoors(current, undo)),
    })
    navigation.goBack()
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t('territories.notes.action')}
        onPressLeftIcon={reviewing ? () => setReviewing(false) : undefined}
        rightElement={
          meter ? (
            <View
              style={{
                position: 'absolute',
                right: 0,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              {meter}
            </View>
          ) : undefined
        }
      />
      <KeyboardAwareScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps='handled'
      >
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
          }}
        >
          {reviewing ? (
            <DoorNotesReview
              territory={territory}
              reader={reader}
              entries={entries}
              problems={problems}
              date={date}
              author={author}
              onChangeEntry={(key, change) =>
                setEntries((current) =>
                  current.map((entry) =>
                    entry.key === key ? { ...entry, ...change } : entry
                  )
                )
              }
              onRemoveEntry={(key) =>
                setEntries((current) =>
                  current.filter((entry) => entry.key !== key)
                )
              }
              onChooseStreet={(key, chosen) =>
                setEntries((current) => {
                  const moved = moveToStreet(
                    current.filter((entry) => groupKey(entry) === key),
                    chosen
                  )
                  const at = current.findIndex(
                    (entry) => groupKey(entry) === key
                  )
                  const rest = current.filter(
                    (entry) => groupKey(entry) !== key
                  )
                  return [...rest.slice(0, at), ...moved, ...rest.slice(at)]
                })
              }
              onAddProblem={(problem) => {
                setProblems((current) =>
                  current.filter((had) => had.key !== problem.key)
                )
                setEntries((current) => [
                  ...current,
                  entryFromProblem(problem, street?.id),
                ])
              }}
              onDismissProblem={(problem) =>
                setProblems((current) =>
                  current.filter((had) => had.key !== problem.key)
                )
              }
              onChangeDate={setDate}
              onChangeAuthor={setAuthor}
              onSave={save}
            />
          ) : (
            <DoorNotesTextStep
              text={text}
              onChangeText={(value) => {
                setText(value)
                setNothingRead(null)
              }}
              forStreet={!!street}
              scribe={ai.mode === 'available'}
              nothingRead={nothingRead}
              reading={reading.busy}
              canScan={canScanDocumentText()}
              onScan={() => void scan()}
              onRead={() => void read()}
            />
          )}
        </ContentColumn>
      </KeyboardAwareScrollView>
    </View>
  )
}
