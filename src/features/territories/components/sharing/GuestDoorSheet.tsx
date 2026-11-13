import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import DoorOutcomeButtons from '@/features/territories/components/DoorOutcomeButtons'
import { OUTCOME_LABEL } from '@/features/territories/lib/outcomes'
import {
  doorRecordedText,
  recordedByText,
} from '@/features/territories/lib/shareText'
import type {
  DoorOutcome,
  TerritoryDoor,
} from '@/features/territories/types/territory'

export default function GuestDoorSheet({
  door,
  title,
  recordedBy,
  mine,
  onPick,
  onRemove,
  onClose,
}: {
  door: TerritoryDoor | null
  title: string
  recordedBy?: string
  mine: boolean
  onPick: (outcome: DoorOutcome) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const theme = useTheme()
  return (
    <Sheet
      open={!!door}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      accessibilityLabel={title}
      testID='guest-door-sheet'
    >
      <Sheet.ScrollView>
        {door && (
          <View style={{ gap: 16, padding: 20, paddingTop: 28 }}>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text
                accessibilityRole='header'
                testID='guest-door-title'
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: 34,
                  lineHeight: 42,
                  textAlign: 'center',
                }}
              >
                {title}
              </Text>
              <Text style={{ textAlign: 'center' }}>
                {`${i18n.t(OUTCOME_LABEL[door.outcome])} · ${
                  mine
                    ? recordedByText(null, door.at)
                    : doorRecordedText(door.at)
                }`}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                textAlign: 'center',
              }}
            >
              {recordedBy
                ? i18n.t('territories.guest.changeOthers', { name: recordedBy })
                : i18n.t('territories.guest.changeResult')}
            </Text>
            <DoorOutcomeButtons
              onPick={onPick}
              testIDPrefix='guest-door-outcome'
              current={door.outcome}
            />
            <Button
              testID='guest-door-done'
              onPress={onClose}
              style={{
                minHeight: 52,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.backgroundLighter,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {i18n.t('done')}
              </Text>
            </Button>
            {onRemove && (
              <Button
                testID='guest-door-remove'
                onPress={onRemove}
                style={{
                  alignSelf: 'center',
                  minHeight: 44,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: theme.colors.error,
                    fontFamily: theme.fonts.medium,
                  }}
                >
                  {i18n.t('territories.guest.removeRecord')}
                </Text>
              </Button>
            )}
          </View>
        )}
      </Sheet.ScrollView>
    </Sheet>
  )
}
