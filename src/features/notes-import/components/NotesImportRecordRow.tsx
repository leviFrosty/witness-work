import { View } from 'react-native'
import Checkbox from 'expo-checkbox'
import moment from 'moment'
import {
  faCircleExclamation,
  faCircleInfo,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import type { MinuteDisplayFormat } from '@/types/timeEntry'
import type { PreviewRow } from '@/features/notes-import/lib/buildNotesImportPreview'
import type { MappedWarning } from '@/features/notes-import/lib/mapNotesImport'
import type { NotesImportSeverity } from '@/features/notes-import/lib/notesImportTypes'

/**
 * The colour + icon for each warning severity. Kept distinct so a user can tell
 * an FYI (gray info) from a heads-up (amber warning) from a blocker (red error)
 * at a glance, instead of every note reading as the same gray triangle.
 */
export const severityVisual = (
  theme: ReturnType<typeof useTheme>,
  severity: NotesImportSeverity | undefined
): { color: string; icon: IconProp } => {
  switch (severity) {
    case 'error':
      return { color: theme.colors.error, icon: faCircleExclamation }
    case 'warning':
      return { color: theme.colors.warnText, icon: faTriangleExclamation }
    default:
      return { color: theme.colors.textAlt, icon: faCircleInfo }
  }
}

/**
 * A single warning shown in full. Import review must not hide context behind an
 * undiscoverable interaction.
 */
export const WarningLine = ({ warning }: { warning: MappedWarning }) => {
  const theme = useTheme()
  const { color, icon } = severityVisual(theme, warning.severity)
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 4,
      }}
    >
      <FontAwesomeIcon
        icon={icon}
        size={11}
        color={color}
        style={{ marginTop: 2 }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: theme.fontSize('xs'),
          lineHeight: theme.fontSize('xs') * 1.35,
          color,
        }}
      >
        {warning.message}
      </Text>
    </View>
  )
}

/** Primary display text for a preview row, with per-kind fallbacks. */
export const rowTitle = (row: PreviewRow): string => {
  if (row.title) return row.title
  if (row.kind === 'visit') return i18n.t('notesImport_untitledVisit')
  if (row.kind === 'timeEntry') return i18n.t('notesImport_untitledTime')
  return row.id
}

/** A muted one-line summary (date · duration · flags) for a preview row. */
export const rowSubtitle = (
  row: PreviewRow,
  format: MinuteDisplayFormat
): string | undefined => {
  const parts: string[] = []
  if (row.date) parts.push(moment(row.date).format('MMM D, YYYY'))
  if (row.kind === 'timeEntry') {
    parts.push(formatMinutes(row.minutes ?? 0, format).formatted)
  }
  if (row.isBibleStudy) parts.push(i18n.t('notesImport_bibleStudy'))
  if (row.notAtHome) parts.push(i18n.t('notesImport_notAtHome'))
  return parts.length ? parts.join(' · ') : undefined
}

interface RecordRowProps {
  title: string
  subtitle?: string
  warnings: MappedWarning[]
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}

/**
 * A selectable record line: title, optional subtitle, its warnings, and a
 * checkbox. Reused for time entries and the publisher role row.
 */
const RecordRow = ({
  title,
  subtitle,
  warnings,
  checked,
  disabled,
  onToggle,
}: RecordRowProps) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onToggle}
      disabled={disabled}
      noTransform
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        opacity: disabled ? 0.5 : 1,
      }}
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

export default RecordRow
