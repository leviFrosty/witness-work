import { useState } from 'react'
import { View } from 'react-native'
import {
  Minus as MinusIcon,
  Pencil as PencilIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const STEP_SIZE = 56

function StepButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: AppIcon
  label: string
  onPress: () => void
  testID: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      accessibilityLabel={label}
      testID={testID}
      style={{
        width: STEP_SIZE,
        height: STEP_SIZE,
        borderRadius: STEP_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon icon={icon} size={24} color={theme.colors.text} />
    </Button>
  )
}

export default function DoorStepper({
  label,
  numbered,
  onChangeLabel,
  onStep,
  back,
}: {
  label: string

  numbered: boolean
  onChangeLabel: (label: string) => void
  onStep: (direction: 1 | -1) => void

  back: { label: string; onPress: () => void } | null
}) {
  const theme = useTheme()
  const [editing, setEditing] = useState(false)
  return (
    <View style={{ gap: 6, alignItems: 'center' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'stretch',
          gap: 12,
        }}
      >
        <StepButton
          icon={MinusIcon}
          label={i18n.t('territories.previousDoor')}
          onPress={() => onStep(-1)}
          testID='door-step-back'
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TextInput
            value={label}
            onChangeText={onChangeLabel}
            accessibilityLabel={i18n.t(
              numbered ? 'territories.houseNumber' : 'territories.doorNumber'
            )}
            keyboardType='numbers-and-punctuation'
            autoCapitalize='characters'
            autoCorrect={false}
            selectTextOnFocus
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            maxLength={8}
            testID='door-label'
            textAlign='center'
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: 40,
              minHeight: 64,
              paddingVertical: 4,
            }}
          />
          {!editing && (
            <View
              pointerEvents='none'
              style={{ position: 'absolute', right: 16 }}
            >
              <LucideIcon
                icon={PencilIcon}
                size={16}
                color={theme.colors.textAlt}
              />
            </View>
          )}
        </View>
        <StepButton
          icon={PlusIcon}
          label={i18n.t('territories.nextDoor')}
          onPress={() => onStep(1)}
          testID='door-step-forward'
        />
      </View>
      {back && (
        <Button
          onPress={back.onPress}
          testID='door-back'
          style={{
            minHeight: 44,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.accent,
            }}
          >
            {back.label}
          </Text>
        </Button>
      )}
    </View>
  )
}
