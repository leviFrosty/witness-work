import { View } from 'react-native'
import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import DoorNoteEntryRow from '@/features/territories/components/DoorNoteEntryRow'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import {
  noteFlags,
  type NoteGroup,
} from '@/features/territories/lib/noteReview'
import type { NoteEntry } from '@/features/territories/lib/parseDoorNotes'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export default function DoorNotesStreetGroup({
  group,
  entries,
  territory,
  savedAt,
  onChange,
  onRemove,
  onChooseStreet,
}: {
  group: NoteGroup
  entries: readonly NoteEntry[]
  territory: Territory
  savedAt: number
  onChange: (
    key: string,
    change: Partial<Pick<NoteEntry, 'label' | 'outcome'>>
  ) => void
  onRemove: (key: string) => void
  onChooseStreet: (street: TerritoryStreet) => void
}) {
  const theme = useTheme()
  const street = territory.streets.find((had) => had.id === group.streetId)
  const title = street
    ? street.name
    : group.heading
      ? i18n.t('territories.notes.unknownStreet', { street: group.heading })
      : i18n.t('territories.notes.noStreet')

  return (
    <View style={{ gap: 8 }} testID={`note-group-${group.key}`}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <TerritorySectionTitle>{title}</TerritorySectionTitle>
        </View>
        {!street && (
          <PullDownMenu
            accessibilityLabel={i18n.t('territories.notes.chooseStreet')}
            hoverRadius={22}
            testID={`note-choose-street-${group.key}`}
            actions={territory.streets.map((option) => ({
              id: option.id,
              title: option.name,
              onPress: () => onChooseStreet(option),
            }))}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                paddingHorizontal: 16,
                borderRadius: 22,
                backgroundColor: theme.colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textInverse,
                }}
              >
                {i18n.t('territories.notes.chooseStreet')}
              </Text>
              <LucideIcon
                icon={ChevronDownIcon}
                size={14}
                color={theme.colors.textInverse}
              />
            </View>
          </PullDownMenu>
        )}
      </View>
      <Section>
        {group.entries.map((entry, index) => (
          <DoorNoteEntryRow
            key={entry.key}
            entry={entry}
            numbering={street?.numbering}
            flags={noteFlags(entry, entries, territory, formatDoorAddress)}
            last={index === group.entries.length - 1}
            savedAt={savedAt}
            onChange={(change) => onChange(entry.key, change)}
            onRemove={() => onRemove(entry.key)}
          />
        ))}
      </Section>
    </View>
  )
}
