import {
  BookUser as BookUserIcon,
  Clock as ClockIcon,
  MessagesSquare as MessagesSquareIcon,
  User as UserIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import Switch from '@/components/ui/Switch'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
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
  icon: AppIcon
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
      accessibilityRole='switch'
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`${label}: ${value}`}
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
        <LucideIcon icon={icon} size={16} color={theme.colors.textAlt} />
        <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>{value}</Text>
        {}
        <View pointerEvents='none'>
          <Switch value={checked} disabled={disabled} accessible={false} />
        </View>
      </View>
    </Button>
  )
}

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
          icon={BookUserIcon}
          label={i18n.t('mytimeImport_contacts')}
          value={formatPlainNumber(preview.contacts)}
          checked={selection.contacts}
          disabled={disabled}
          onToggle={() => onToggle('contacts')}
        />
      )}
      {preview.visits > 0 && (
        <Row
          icon={MessagesSquareIcon}
          label={i18n.t('mytimeImport_visits')}
          value={formatPlainNumber(preview.visits)}
          checked={selection.visits}
          disabled={disabled}
          onToggle={() => onToggle('visits')}
        />
      )}
      {preview.timeEntries > 0 && (
        <Row
          icon={ClockIcon}
          label={i18n.t('mytimeImport_time')}
          value={time.formatted}
          checked={selection.time}
          disabled={disabled}
          onToggle={() => onToggle('time')}
        />
      )}
      {preview.publisherRole && (
        <Row
          icon={UserIcon}
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
