import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import confirmDestructive from '@/lib/confirmDestructive'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import { fromDateKey } from '@/lib/mileage/calc'

type Entry = { id: string; effectiveFrom: string; value: string }

type Props = {
  /** Ascending by `effectiveFrom`. */
  entries: Entry[]
  onDelete: (id: string) => void
}

/**
 * Past values, newest first. The oldest applies to every earlier trip, so it
 * reads "Initial". Long-press to delete any entry but the last one standing.
 */
export default function HistoryList({ entries, onDelete }: Props) {
  const theme = useTheme()
  if (entries.length < 2) return null
  const newestFirst = [...entries].reverse()

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          marginLeft: 5,
        }}
      >
        {i18n.t('mileage.history')}
      </Text>
      <Section>
        {newestFirst.map((entry, i) => {
          const isInitial = entry.id === entries[0].id
          return (
            <ContextMenu
              key={entry.id}
              actions={[
                {
                  id: 'delete',
                  title: i18n.t('delete'),
                  systemImage: 'trash',
                  destructive: true,
                  onPress: () =>
                    confirmDestructive({
                      title: i18n.t('mileage.deleteHistory_title'),
                      description: i18n.t('mileage.deleteHistory_description'),
                      onConfirm: () => onDelete(entry.id),
                    }),
                },
              ]}
            >
              <View>
                <InputRowContainer
                  label={
                    isInitial
                      ? i18n.t('mileage.initialValue')
                      : i18n.t('mileage.sinceDate', {
                          date: formatDate(fromDateKey(entry.effectiveFrom), {
                            style: 'medium',
                          }),
                        })
                  }
                  controlWidth='auto'
                  lastInSection={i === newestFirst.length - 1}
                >
                  <Text style={{ color: theme.colors.textAlt }}>
                    {entry.value}
                  </Text>
                </InputRowContainer>
              </View>
            </ContextMenu>
          )
        })}
      </Section>
    </View>
  )
}
