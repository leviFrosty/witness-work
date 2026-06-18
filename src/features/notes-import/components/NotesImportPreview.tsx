import { View } from 'react-native'
import Checkbox from 'expo-checkbox'
import moment from 'moment'
import {
  faAddressBook,
  faClock,
  faComments,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import type {
  NotesImportPreview as Preview,
  PreviewKind,
  PreviewRow,
  PreviewSelection,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import type { MappedWarning } from '@/features/notes-import/lib/mapNotesImport'

interface Props {
  preview: Preview
  selection: PreviewSelection
  toggleRow: (id: string) => void
  togglePublisher: () => void
  setGroup: (kind: PreviewKind, value: boolean) => void
  disabled?: boolean
}

const WarningLine = ({ warning }: { warning: MappedWarning }) => {
  const theme = useTheme()
  const color =
    warning.severity === 'error' ? theme.colors.error : theme.colors.textAlt
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
      }}
    >
      <FontAwesomeIcon icon={faTriangleExclamation} size={11} color={color} />
      <Text style={{ flex: 1, fontSize: theme.fontSize('xs'), color }}>
        {warning.message}
      </Text>
    </View>
  )
}

const RecordRow = ({
  title,
  subtitle,
  warnings,
  checked,
  disabled,
  onToggle,
}: {
  title: string
  subtitle?: string
  warnings: MappedWarning[]
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onToggle}
      disabled={disabled}
      noTransform
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }} numberOfLines={2}>
          {title}
        </Text>
        {!!subtitle && (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {subtitle}
          </Text>
        )}
        {warnings.map((w) => (
          <WarningLine key={w.id} warning={w} />
        ))}
      </View>
      <View pointerEvents='none' style={{ paddingTop: 2 }}>
        <Checkbox value={checked} color={theme.colors.accent} />
      </View>
    </Button>
  )
}

const GroupHeader = ({
  icon,
  label,
  count,
  allSelected,
  disabled,
  onToggleAll,
}: {
  icon: IconProp
  label: string
  count: number
  allSelected: boolean
  disabled?: boolean
  onToggleAll: () => void
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FontAwesomeIcon icon={icon} size={14} color={theme.colors.textAlt} />
        <Text style={{ fontFamily: theme.fonts.bold }}>
          {label} ({count})
        </Text>
      </View>
      <Button onPress={onToggleAll} disabled={disabled} noTransform>
        <Text
          style={{
            color: theme.colors.accent,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {allSelected
            ? i18n.t('notesImport_deselectAll')
            : i18n.t('notesImport_selectAll')}
        </Text>
      </Button>
    </View>
  )
}

const NotesImportPreview = ({
  preview,
  selection,
  toggleRow,
  togglePublisher,
  setGroup,
  disabled,
}: Props) => {
  const theme = useTheme()
  const format = usePreferences((s) => s.timeDisplayFormat)

  const rowSubtitle = (row: PreviewRow): string | undefined => {
    const parts: string[] = []
    if (row.date) parts.push(moment(row.date).format('MMM D, YYYY'))
    if (row.kind === 'timeEntry') {
      parts.push(formatMinutes(row.minutes ?? 0, format).formatted)
    }
    if (row.isBibleStudy) parts.push(i18n.t('notesImport_bibleStudy'))
    if (row.notAtHome) parts.push(i18n.t('notesImport_notAtHome'))
    return parts.length ? parts.join(' · ') : undefined
  }

  const titleFor = (row: PreviewRow): string => {
    if (row.title) return row.title
    if (row.kind === 'visit') return i18n.t('notesImport_untitledVisit')
    if (row.kind === 'timeEntry') return i18n.t('notesImport_untitledTime')
    return row.id
  }

  const allSelected = (rows: PreviewRow[]) =>
    rows.length > 0 && rows.every((r) => selection.ids.has(r.id))

  const Group = ({
    kind,
    icon,
    label,
    rows,
  }: {
    kind: PreviewKind
    icon: IconProp
    label: string
    rows: PreviewRow[]
  }) => {
    if (!rows.length) return null
    const selected = allSelected(rows)
    return (
      <Card style={{ gap: 12 }}>
        <GroupHeader
          icon={icon}
          label={label}
          count={rows.length}
          allSelected={selected}
          disabled={disabled}
          onToggleAll={() => setGroup(kind, !selected)}
        />
        {rows.map((row) => (
          <RecordRow
            key={row.id}
            title={titleFor(row)}
            subtitle={rowSubtitle(row)}
            warnings={row.warnings}
            checked={selection.ids.has(row.id)}
            disabled={disabled}
            onToggle={() => toggleRow(row.id)}
          />
        ))}
      </Card>
    )
  }

  return (
    <View style={{ gap: 16 }}>
      <Group
        kind='contact'
        icon={faAddressBook}
        label={i18n.t('notesImport_contacts')}
        rows={preview.contacts}
      />
      <Group
        kind='visit'
        icon={faComments}
        label={i18n.t('notesImport_visits')}
        rows={preview.visits}
      />
      <Group
        kind='timeEntry'
        icon={faClock}
        label={i18n.t('notesImport_time')}
        rows={preview.timeEntries}
      />

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

      {preview.generalWarnings.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Text style={{ fontFamily: theme.fonts.bold }}>
            {i18n.t('notesImport_warningsTitle')}
          </Text>
          {preview.generalWarnings.map((w) => (
            <WarningLine key={w.id} warning={w} />
          ))}
        </Card>
      )}
    </View>
  )
}

export default NotesImportPreview
