import { useEffect, useRef, useState } from 'react'
import { TextInput as RNTextInput, View } from 'react-native'
import Sheet from '@/components/ui/Sheet'

import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { parseDecimalInput } from '@/lib/digits'
import { formatPlainNumber } from '@/lib/numbers'
import { useFormattedMinutes } from '@/lib/minutes'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { alignText } from '@/lib/direction'
import { formatDisplay } from '@/lib/dates'

export interface MonthGoalEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  month: number
  year: number
  regularGoalHours: number
  effectiveGoalHours: number
  annualGoalHours: number | null
  onSaveGoal: (goalHours: number) => void
  onUseRegularGoal: () => void
}

const normalizeDecimalInput = (value: string): string => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '')
  const [whole = '', ...decimalParts] = normalized.split('.')

  if (decimalParts.length === 0) return whole

  return `${whole}.${decimalParts.join('').slice(0, 2)}`
}

const MonthGoalEditorSheet = ({
  open,
  onOpenChange,
  month,
  year,
  regularGoalHours,
  effectiveGoalHours,
  annualGoalHours,
  onSaveGoal,
  onUseRegularGoal,
}: MonthGoalEditorSheetProps) => {
  const theme = useTheme()
  const inputRef = useRef<RNTextInput>(null)
  const [draftGoal, setDraftGoal] = useState(
    formatPlainNumber(effectiveGoalHours)
  )
  const [showValidationError, setShowValidationError] = useState(false)

  const regularGoalDisplay = useFormattedMinutes(
    Math.round(regularGoalHours * 60)
  )
  useEffect(() => {
    if (!open) return
    setDraftGoal(formatPlainNumber(effectiveGoalHours))
    setShowValidationError(false)
  }, [effectiveGoalHours, open])

  const parsedGoal = parseDecimalInput(draftGoal)
  const hasValidGoal = parsedGoal !== undefined
  const hasOverride =
    Math.abs(effectiveGoalHours - regularGoalHours) > Number.EPSILON
  const monthLabel = formatDisplay({ year, month }, 'MMMM YYYY')

  const handleSave = () => {
    if (!hasValidGoal) {
      setShowValidationError(true)
      inputRef.current?.focus()
      return
    }

    onSaveGoal(parsedGoal)
    onOpenChange(false)
  }

  const handleUseRegularGoal = () => {
    onUseRegularGoal()
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      backgroundColor={theme.colors.background}
    >
      <Sheet.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: inputLayout.horizontalPadding,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          paddingTop: 22,
          paddingBottom: 32,
          gap: 20,
        }}
      >
        <Text
          accessibilityRole='header'
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xl'),
            paddingHorizontal: inputLayout.horizontalPadding,
          }}
        >
          {i18n.t('monthGoalEditor.title', { month: monthLabel })}
        </Text>

        <Section>
          <InputRowContainer
            label={i18n.t('monthGoalEditor.regularGoal')}
            info={i18n.t('monthGoalEditor.regularGoalDescription')}
            controlWidth='auto'
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('lg'),
                textAlign: alignText('end'),
              }}
            >
              {regularGoalDisplay.formatted}
            </Text>
          </InputRowContainer>
          <InputRowContainer
            label={i18n.t('monthGoalEditor.monthGoal')}
            info={
              annualGoalHours === null
                ? i18n.t('monthGoalEditor.explanationWithoutAnnualGoal', {
                    month: monthLabel,
                  })
                : i18n.t('monthGoalEditor.explanation', { month: monthLabel })
            }
            onLabelPress={() => inputRef.current?.focus()}
            lastInSection
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <TextInput
                ref={inputRef}
                accessibilityLabel={i18n.t('monthGoalEditor.monthGoal')}
                accessibilityHint={i18n.t('monthGoalEditor.inputHint')}
                value={draftGoal}
                onChangeText={(value) => {
                  setDraftGoal(normalizeDecimalInput(value))
                }}
                onSubmitEditing={handleSave}
                keyboardType='decimal-pad'
                returnKeyType='done'
                selectTextOnFocus
                maxLength={7}
                error={
                  showValidationError && !hasValidGoal
                    ? i18n.t('monthGoalEditor.invalidGoal')
                    : undefined
                }
                style={{ flex: 1, minWidth: 0 }}
              />
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  flexShrink: 1,
                }}
              >
                {i18n.t('hours_lowercase')}
              </Text>
            </View>
            {showValidationError && !hasValidGoal && (
              <Text
                accessibilityRole='alert'
                style={{
                  color: theme.colors.error,
                  fontSize: theme.fontSize('sm'),
                  marginTop: 4,
                }}
              >
                {i18n.t('monthGoalEditor.invalidGoal')}
              </Text>
            )}
          </InputRowContainer>
        </Section>

        {hasOverride && (
          <Button
            noTransform
            accessibilityRole='button'
            onPress={handleUseRegularGoal}
            variant='outline'
            style={{
              justifyContent: 'center',
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('monthGoalEditor.useRegularGoal', {
                goal: regularGoalDisplay.formatted,
              })}
            </Text>
          </Button>
        )}

        <ActionButton
          noTransform
          accessibilityRole='button'
          onPress={handleSave}
        >
          {i18n.t('save')}
        </ActionButton>
      </Sheet.ScrollView>
    </Sheet>
  )
}

export default MonthGoalEditorSheet
