import { View } from 'react-native'
import Checkbox from 'expo-checkbox'
import { faAddressBook } from '@fortawesome/free-solid-svg-icons/faAddressBook'
import { faClock } from '@fortawesome/free-solid-svg-icons/faClock'
import { faComments } from '@fortawesome/free-solid-svg-icons/faComments'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import type {
  MytimeImportPreview as Preview,
  MytimeImportSelection,
  MytimeImportSelectionKey,
} from '@/features/mytime-import/hooks/useMytimeImport'

interface Props {
  preview: Preview
  selection: MytimeImportSelection
  onToggle: (key: MytimeImportSelectionKey) => void
  /** Lock the checkboxes while the import is being written. */
  disabled?: boolean
}

const Row = ({
  icon,
  label,
  value,
  checked,
  disabled,
  onToggle,
}: {
  icon: IconProp
  label: string
  value: string
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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
      >
        <FontAwesomeIcon icon={icon} size={16} color={theme.colors.textAlt} />
        <Text style={{ color: theme.colors.textAlt }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>{value}</Text>
        {/* Visual only — the whole row is the tap target. */}
        <View pointerEvents='none'>
          <Checkbox value={checked} color={theme.colors.accent} />
        </View>
      </View>
    </Button>
  )
}

/**
 * The "here's what will be imported" summary shared by both surfaces. Every
 * piece with data gets a checkbox (all checked by default) so the user can
 * deselect pieces they don't want; the caller's confirm action reads the
 * selection from the hook. Counts come straight from the already-mapped backup
 * (array lengths), so what's shown is exactly what gets written. Time is
 * rendered through the minutes formatter so it honors the user's display-format
 * preference.
 */
const MytimeImportPreview = ({
  preview,
  selection,
  onToggle,
  disabled,
}: Props) => {
  const time = useFormattedMinutes(preview.totalMinutes)

  return (
    <Card style={{ gap: 14 }}>
      {preview.contacts > 0 && (
        <Row
          icon={faAddressBook}
          label={i18n.t('mytimeImport_contacts')}
          value={String(preview.contacts)}
          checked={selection.contacts}
          disabled={disabled}
          onToggle={() => onToggle('contacts')}
        />
      )}
      {preview.visits > 0 && (
        <Row
          icon={faComments}
          label={i18n.t('mytimeImport_visits')}
          value={String(preview.visits)}
          checked={selection.visits}
          disabled={disabled}
          onToggle={() => onToggle('visits')}
        />
      )}
      {preview.timeEntries > 0 && (
        <Row
          icon={faClock}
          label={i18n.t('mytimeImport_time')}
          value={time.formatted}
          checked={selection.time}
          disabled={disabled}
          onToggle={() => onToggle('time')}
        />
      )}
      {preview.publisherRole && (
        <Row
          icon={faUser}
          label={i18n.t('mytimeImport_role')}
          value={i18n.t(preview.publisherRole as TranslationKey)}
          checked={selection.publisher}
          disabled={disabled}
          onToggle={() => onToggle('publisher')}
        />
      )}
    </Card>
  )
}

export default MytimeImportPreview
