import { View } from 'react-native'
import { ChevronDown as ChevronDownIcon, X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import { countsAsAnotherTry } from '@/features/territories/lib/doors'
import type { NoteFlags } from '@/features/territories/lib/noteReview'
import {
  DOOR_OUTCOMES,
  OUTCOME_ICON,
  OUTCOME_LABEL,
  outcomeColor,
} from '@/features/territories/lib/outcomes'
import type { NoteEntry } from '@/features/territories/lib/parseDoorNotes'
import { doorTitle } from '@/features/territories/lib/territoryTitle'
import type {
  DoorOutcome,
  StreetNumbering,
} from '@/features/territories/types/territory'

export default function DoorNoteEntryRow({
  entry,
  numbering,
  flags,
  last,
  savedAt,
  onChange,
  onRemove,
}: {
  entry: NoteEntry
  numbering: StreetNumbering | undefined
  flags: NoteFlags
  last: boolean
  savedAt: number
  onChange: (change: Partial<Pick<NoteEntry, 'label' | 'outcome'>>) => void
  onRemove: () => void
}) {
  const theme = useTheme()
  const color = outcomeColor(entry.outcome, theme.colors)
  const unnumbered = numbering === 'none'
  const title = entry.label.trim()
    ? doorTitle({ numbering: numbering ?? 'both' }, entry.label.trim())
    : i18n.t(unnumbered ? 'territories.doorNumber' : 'territories.houseNumber')
  const side =
    numbering === 'odd' || numbering === 'even' ? numbering : undefined

  const notes = [
    flags.doNotCall && {
      key: 'dnc',
      text: i18n.t('territories.notes.onDoNotCallList', {
        date: formatDate(flags.doNotCall.at, { style: 'medium' }),
      }),
      color: theme.colors.error,
    },
    flags.recorded && {
      key: 'recorded',
      text: i18n.t(
        countsAsAnotherTry(flags.recorded, savedAt)
          ? 'territories.notes.recordedBefore_anotherTry'
          : 'territories.notes.recordedBefore_replaces',
        {
          date: formatDate(flags.recorded.at, { style: 'medium' }),
          outcome: i18n.t(OUTCOME_LABEL[flags.recorded.outcome]),
        }
      ),
      color: theme.colors.orange,
    },
    flags.twice && {
      key: 'twice',
      text: i18n.t('territories.notes.listedTwice'),
      color: theme.colors.orange,
    },
    entry.range &&
      flags.rangeStart && {
        key: 'range',
        text: side
          ? i18n.t(`territories.notes.fromRangeSide.${side}`, {
              range: entry.range.text,
            })
          : i18n.t('territories.notes.fromRange', {
              range: entry.range.text,
            }),
        color: theme.colors.textAlt,
      },
    entry.written && {
      key: 'written',
      text: i18n.t('territories.notes.fromLine', { line: entry.written }),
      color: theme.colors.textAlt,
    },
    entry.ignored && {
      key: 'ignored',
      text: i18n.t('territories.notes.ignored', { text: entry.ignored }),
      color: theme.colors.textAlt,
    },
  ].filter((note) => !!note)

  return (
    <View
      testID={`note-entry-${entry.label}`}
      style={{
        paddingStart: inputLayout.horizontalPadding,
        paddingEnd: 6,
        paddingVertical: 10,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {unnumbered && (
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('territories.notes.door')}
          </Text>
        )}
        <TextInput
          value={entry.label}
          onChangeText={(label) => onChange({ label })}
          accessibilityLabel={i18n.t(
            unnumbered ? 'territories.doorNumber' : 'territories.houseNumber'
          )}
          autoCapitalize='characters'
          autoCorrect={false}
          maxLength={12}
          invalid={!entry.label.trim()}
          testID={`note-label-${entry.key}`}
          textAlign='center'
          style={{
            width: 84,
            minHeight: 44,
            borderWidth: 1,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        />
        <PullDownMenu
          accessibilityLabel={i18n.t('territories.notes.outcomeFor', {
            door: title,
          })}
          accessibilityValue={i18n.t(OUTCOME_LABEL[entry.outcome])}
          hoverRadius={22}
          style={{ flex: 1 }}
          testID={`note-outcome-${entry.key}`}
          actions={DOOR_OUTCOMES.map((outcome: DoorOutcome) => ({
            id: outcome,
            title: i18n.t(OUTCOME_LABEL[outcome]),
            checked: outcome === entry.outcome,
            onPress: () => onChange({ outcome }),
          }))}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: 6,
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: 22,
              backgroundColor: `${color}1F`,
            }}
          >
            <LucideIcon
              icon={OUTCOME_ICON[entry.outcome]}
              size={16}
              color={color}
            />
            <Text
              numberOfLines={1}
              style={{ fontFamily: theme.fonts.semiBold, color, flexShrink: 1 }}
            >
              {i18n.t(OUTCOME_LABEL[entry.outcome])}
            </Text>
            <LucideIcon icon={ChevronDownIcon} size={14} color={color} />
          </View>
        </PullDownMenu>
        <Button
          onPress={onRemove}
          accessibilityLabel={i18n.t('territories.removeDoor', { door: title })}
          testID={`note-remove-${entry.key}`}
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon icon={XIcon} size={18} color={theme.colors.textAlt} />
        </Button>
      </View>
      {notes.map((note) => (
        <Text
          key={note.key}
          style={{
            color: note.color,
            fontSize: theme.fontSize('sm'),
            paddingEnd: 10,
          }}
        >
          {note.text}
        </Text>
      ))}
      {!last && <RowSeparator />}
    </View>
  )
}
