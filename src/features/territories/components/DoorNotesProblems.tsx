import { View } from 'react-native'
import { Plus as PlusIcon, X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import TerritoryPill from '@/features/territories/components/TerritoryPill'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import type { NoteProblem } from '@/features/territories/lib/parseDoorNotes'

export default function DoorNotesProblems({
  problems,
  onAdd,
  onDismiss,
}: {
  problems: readonly NoteProblem[]
  onAdd: (problem: NoteProblem) => void
  onDismiss: (problem: NoteProblem) => void
}) {
  const theme = useTheme()
  if (problems.length === 0) return null

  return (
    <View style={{ gap: 8 }} testID='note-problems'>
      <TerritorySectionTitle info={i18n.t('territories.notes.problems_info')}>
        {i18n.t('territories.notes.problems')}
      </TerritorySectionTitle>
      <Section>
        {problems.map((problem, index) => (
          <View
            key={problem.key}
            style={{
              paddingStart: inputLayout.horizontalPadding,
              paddingEnd: 6,
              paddingTop: 16,
              paddingBottom: 12,
              gap: 4,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
            >
              <View style={{ flex: 1, gap: 2, paddingTop: 2 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.text,
                  }}
                >
                  {problem.text}
                </Text>
                {problem.text !== problem.source && (
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t('territories.notes.fromLine', {
                      line: problem.source,
                    })}
                  </Text>
                )}
              </View>
              <Button
                onPress={() => onDismiss(problem)}
                accessibilityLabel={i18n.t('territories.notes.dismiss', {
                  text: problem.text,
                })}
                testID={`note-dismiss-${problem.key}`}
                style={{
                  width: 44,
                  height: 44,
                  marginTop: -10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LucideIcon
                  icon={XIcon}
                  size={18}
                  color={theme.colors.textAlt}
                />
              </Button>
            </View>
            <TerritoryPill
              icon={PlusIcon}
              surface='background'
              label={i18n.t('territories.notes.addAsEntry')}
              onPress={() => onAdd(problem)}
              testID={`note-add-${problem.key}`}
            />
            {index < problems.length - 1 && <RowSeparator />}
          </View>
        ))}
      </Section>
    </View>
  )
}
