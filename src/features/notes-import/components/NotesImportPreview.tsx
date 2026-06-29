import { useMemo, useState } from 'react'
import { View } from 'react-native'
import Checkbox from 'expo-checkbox'
import {
  faAddressBook,
  faChevronRight,
  faClock,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import RecordRow, {
  rowSubtitle,
  rowTitle,
  severityVisual,
} from '@/features/notes-import/components/NotesImportRecordRow'
import NotesImportContactDetailsModal, {
  type ContactGroup,
} from '@/features/notes-import/components/NotesImportContactDetailsModal'
import {
  highestSeverity,
  maxSeverity,
  type NotesImportPreview as Preview,
  type PreviewKind,
  type PreviewRow,
  type PreviewSelection,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import { visitCountLabel } from '@/features/notes-import/lib/notesImportMessages'
import type { NotesImportSeverity } from '@/features/notes-import/lib/notesImportTypes'

interface Props {
  preview: Preview
  selection: PreviewSelection
  toggleRow: (id: string) => void
  togglePublisher: () => void
  setGroup: (kind: PreviewKind, value: boolean) => void
  setRows: (ids: string[], value: boolean) => void
  disabled?: boolean
}

/** Highest severity across a contact's own warnings and all of its visits. */
const groupSeverity = (
  group: ContactGroup
): NotesImportSeverity | undefined => {
  let top = highestSeverity(group.warnings)
  for (const v of group.visits) top = maxSeverity(top, v.severity)
  return top
}

const groupWarningCount = (group: ContactGroup): number =>
  group.warnings.length +
  group.visits.reduce((sum, v) => sum + v.warnings.length, 0)

const flagCountLabel = (count: number) =>
  i18n.t(
    count === 1 ? 'notesImport_flagCount' : 'notesImport_flagCount_plural',
    { count }
  )

/**
 * A single contact row in the preview: name, visit count, a warning badge, and
 * (for new contacts) an include checkbox. Module-level so its identity stays
 * stable across NotesImportPreview re-renders — declared inline it would
 * remount every card (and its checkbox) on each selection change.
 */
const ContactCard = ({
  group,
  selection,
  disabled,
  toggleRow,
  onOpen,
}: {
  group: ContactGroup
  selection: PreviewSelection
  disabled?: boolean
  toggleRow: (id: string) => void
  onOpen: () => void
}) => {
  const theme = useTheme()
  const severity = groupSeverity(group)
  const warnCount = groupWarningCount(group)
  const included = group.isExisting || selection.ids.has(group.id)
  const tint =
    severity === 'error'
      ? theme.colors.errorTranslucent
      : severity === 'warning'
        ? theme.colors.warnTranslucent
        : theme.colors.backgroundLighter
  const { color, icon } = severityVisual(theme, severity)

  return (
    <Card
      style={{
        paddingVertical: 0,
        paddingHorizontal: 0,
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Button
          noTransform
          disabled={disabled}
          onPress={onOpen}
          style={{ flex: 1, padding: 16, gap: 4 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <FontAwesomeIcon
              icon={faAddressBook}
              size={14}
              color={theme.colors.textAlt}
            />
            <Text
              style={{ flex: 1, fontFamily: theme.fonts.semiBold }}
              numberOfLines={1}
            >
              {group.name}
            </Text>
            {group.isExisting && (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 999,
                  borderCurve: 'continuous',
                  backgroundColor: theme.colors.backgroundLighter,
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('xs'),
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('notesImport_existingTag')}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {group.visits.length > 0
              ? visitCountLabel(group.visits.length)
              : i18n.t('notesImport_noVisits')}
          </Text>
          {severity && warnCount > 0 && (
            <View
              accessibilityLabel={`${warnCount}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                alignSelf: 'flex-start',
                marginTop: 2,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                borderCurve: 'continuous',
                backgroundColor: tint,
              }}
            >
              <FontAwesomeIcon icon={icon} size={10} color={color} />
              <Text
                style={{
                  color,
                  fontSize: theme.fontSize('xs'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {flagCountLabel(warnCount)}
              </Text>
            </View>
          )}
        </Button>

        {!group.isExisting && (
          <Button
            noTransform
            disabled={disabled}
            onPress={() => toggleRow(group.id)}
            style={{ paddingHorizontal: 14, paddingVertical: 16 }}
          >
            <View pointerEvents='none'>
              <Checkbox value={included} color={theme.colors.accent} />
            </View>
          </Button>
        )}
        <FontAwesomeIcon
          icon={faChevronRight}
          size={14}
          color={theme.colors.textAlt}
          style={{ marginRight: 14 }}
        />
      </View>
    </Card>
  )
}

const NotesImportPreview = ({
  preview,
  selection,
  toggleRow,
  togglePublisher,
  setGroup,
  setRows,
  disabled,
}: Props) => {
  const theme = useTheme()
  const format = usePreferences((s) => s.timeDisplayFormat)
  const storeContacts = useContacts((s) => s.contacts)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)

  const existingNameById = useMemo(
    () => new Map(storeContacts.map((c) => [c.id, c.name])),
    [storeContacts]
  )

  // Group every visit under its contact — new contacts (creatable, with
  // details) first, then contacts the user already has (visit-only).
  const groups = useMemo<ContactGroup[]>(() => {
    const newIds = new Set(preview.contacts.map((c) => c.id))
    const visitsByContact = new Map<string, PreviewRow[]>()
    for (const v of preview.visits) {
      const cid = v.contactId ?? '__orphan__'
      const list = visitsByContact.get(cid)
      if (list) list.push(v)
      else visitsByContact.set(cid, [v])
    }

    const newGroups: ContactGroup[] = preview.contacts.map((c) => ({
      id: c.id,
      name: c.title,
      isExisting: false,
      info: c.info,
      warnings: c.warnings,
      visits: visitsByContact.get(c.id) ?? [],
    }))

    const existingGroups: ContactGroup[] = []
    for (const [cid, visits] of visitsByContact) {
      if (newIds.has(cid)) continue
      existingGroups.push({
        id: cid,
        name: existingNameById.get(cid) ?? i18n.t('notesImport_otherContact'),
        isExisting: true,
        warnings: [],
        visits,
      })
    }

    return [...newGroups, ...existingGroups]
  }, [preview.contacts, preview.visits, existingNameById])

  const openGroup = groups.find((g) => g.id === openGroupId) ?? null

  const allTimeSelected =
    preview.timeEntries.length > 0 &&
    preview.timeEntries.every((r) => selection.ids.has(r.id))

  return (
    <View style={{ gap: 16 }}>
      {groups.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('notesImport_contacts')} ({groups.length})
          </Text>
          {groups.map((group) => (
            <ContactCard
              key={group.id}
              group={group}
              selection={selection}
              disabled={disabled}
              toggleRow={toggleRow}
              onOpen={() => setOpenGroupId(group.id)}
            />
          ))}
        </View>
      )}

      {preview.timeEntries.length > 0 && (
        <Card style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <FontAwesomeIcon
                icon={faClock}
                size={14}
                color={theme.colors.textAlt}
              />
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t('notesImport_time')} ({preview.timeEntries.length})
              </Text>
            </View>
            <Button
              onPress={() => setGroup('timeEntry', !allTimeSelected)}
              disabled={disabled}
              noTransform
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {allTimeSelected
                  ? i18n.t('notesImport_deselectAll')
                  : i18n.t('notesImport_selectAll')}
              </Text>
            </Button>
          </View>
          {preview.timeEntries.map((row) => (
            <RecordRow
              key={row.id}
              title={rowTitle(row)}
              subtitle={rowSubtitle(row, format)}
              warnings={row.warnings}
              checked={selection.ids.has(row.id)}
              disabled={disabled}
              onToggle={() => toggleRow(row.id)}
            />
          ))}
        </Card>
      )}

      {preview.hasPublisher && (
        <Card>
          <RecordRow
            title={i18n.t('notesImport_role')}
            subtitle={
              preview.publisherRole
                ? i18n.t(preview.publisherRole as TranslationKey)
                : undefined
            }
            warnings={preview.publisherWarnings}
            checked={selection.publisher}
            disabled={disabled}
            onToggle={togglePublisher}
          />
        </Card>
      )}

      {/* Whole-import notes no longer render here as a "warnings" card — the
          model now folds them into a single conversational `assistantMessage`,
          shown as a WWork AI chat bubble beneath the import button (see
          NotesImportComposerScreen). Per-record warnings still render inline on
          their rows. */}

      <NotesImportContactDetailsModal
        group={openGroup}
        open={openGroupId !== null}
        setOpen={(o) => setOpenGroupId(o ? openGroupId : null)}
        selection={selection}
        toggleRow={toggleRow}
        setRows={setRows}
        disabled={disabled}
      />
    </View>
  )
}

export default NotesImportPreview
