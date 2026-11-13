import { View } from 'react-native'
import { Check as CheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  DOOR_OUTCOMES,
  OUTCOME_ICON,
  OUTCOME_LABEL,
  outcomeColor,
} from '@/features/territories/lib/outcomes'
import type { DoorOutcome } from '@/features/territories/types/territory'

export default function DoorOutcomeButtons({
  onPick,
  testIDPrefix = 'door-outcome',
  current,
}: {
  onPick: (outcome: DoorOutcome) => void

  testIDPrefix?: string

  current?: DoorOutcome
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {DOOR_OUTCOMES.map((outcome) => {
        const color = outcomeColor(outcome, theme.colors)
        const quiet = outcome === 'doNotCall'
        const ink = quiet ? theme.colors.text : theme.colors.textInverse
        return (
          <View
            key={outcome}
            style={{
              flex: 1,
              opacity: current && outcome !== current ? 0.4 : 1,
            }}
          >
            <Button
              onPress={() => onPick(outcome)}
              accessibilityLabel={i18n.t(OUTCOME_LABEL[outcome])}
              testID={`${testIDPrefix}-${outcome}`}
              accessibilityState={
                current ? { selected: outcome === current } : undefined
              }
              style={{
                minHeight: 84,
                paddingVertical: 12,
                paddingHorizontal: 6,
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.numbers.borderRadiusMd,
                borderCurve: 'continuous',
                borderWidth: outcome === current ? 3 : 1.5,
                borderColor: outcome === current ? theme.colors.text : color,
                backgroundColor: quiet ? `${color}22` : color,
              }}
            >
              <LucideIcon
                icon={outcome === current ? CheckIcon : OUTCOME_ICON[outcome]}
                size={26}
                color={quiet ? color : ink}
              />
              <Text
                numberOfLines={2}
                style={{
                  textAlign: 'center',
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('sm'),
                  color: ink,
                }}
              >
                {i18n.t(OUTCOME_LABEL[outcome])}
              </Text>
            </Button>
          </View>
        )
      })}
    </View>
  )
}
