import { View } from 'react-native'
import {
  ChevronRight as ChevronRightIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import EmphasizedText from '@/components/ui/EmphasizedText'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { dayPhrase } from '@/lib/dayPhrases'
import i18n from '@/lib/locales'
import type { Visit } from '@/types/visit'
import { detailsDateTime } from '@/features/visits/lib/visitDetails'

/**
 * The rail's next stop when the Visit planned no Follow-up: the Visit that came
 * next (tapping opens it), or, after the latest Visit, an empty stop that plans
 * the return.
 */
export default function VisitNoFollowUpStop({
  later,
  now,
  onOpenVisit,
  onPlan,
}: {
  /** The contact's next Visit after this one. */
  later?: Visit
  now: number
  onOpenVisit: (visitId: string) => void
  onPlan: () => void
}) {
  const theme = useTheme()

  if (later) {
    const date = new Date(later.date)
    return (
      <Button
        onPress={() => onOpenVisit(later.id)}
        accessibilityRole='link'
        style={{ gap: 6 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <EmphasizedText
            translate={(values) =>
              i18n.t(
                later.notAtHome
                  ? 'visitDetails_wentBackNotHome'
                  : 'visitDetails_wentBack',
                values
              )
            }
            values={{ when: dayPhrase(date, now) }}
            emphasis={{
              fontFamily: theme.fonts.bold,
              color: theme.colors.accent,
            }}
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('lg'),
              lineHeight: 22,
            }}
          />
          <LucideIcon
            icon={ChevronRightIcon}
            size={16}
            color={theme.colors.accent}
          />
        </View>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {detailsDateTime(date)}
        </Text>
      </Button>
    )
  }

  return (
    // No outline: a dashed card is a planned Follow-up.
    <View style={{ alignItems: 'flex-start', gap: 10, paddingTop: 1 }}>
      <Text
        style={{ fontSize: theme.fontSize('lg'), color: theme.colors.textAlt }}
      >
        {i18n.t('visitDetails_noFollowUp')}
      </Text>
      <Button
        onPress={onPlan}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: 38,
          paddingHorizontal: 14,
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        }}
      >
        <LucideIcon icon={PlusIcon} size={16} color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('visitDetails_planNext')}
        </Text>
      </Button>
    </View>
  )
}
