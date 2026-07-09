import moment from 'moment'
import { useEffect, useRef, useState } from 'react'
import { Pressable, TextInput as RNTextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { Sheet } from 'tamagui'

import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'

export interface MonthGoalEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Zero-based calendar month, matching Moment and JavaScript Date. */
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
  const [draftGoal, setDraftGoal] = useState(String(effectiveGoalHours))
  const [showValidationError, setShowValidationError] = useState(false)

  const regularGoalDisplay = useFormattedMinutes(
    Math.round(regularGoalHours * 60)
  )
  useEffect(() => {
    if (!open) return
    setDraftGoal(String(effectiveGoalHours))
    setShowValidationError(false)
  }, [effectiveGoalHours, open])

  const parsedGoal = Number.parseFloat(draftGoal)
  const hasValidGoal = Number.isFinite(parsedGoal) && parsedGoal >= 0
  const hasOverride =
    Math.abs(effectiveGoalHours - regularGoalHours) > Number.EPSILON
  const monthLabel = moment({ year, month }).format('MMMM YYYY')

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
      dismissOnSnapToBottom
      modal
      moveOnKeyboardChange
      snapPoints={[72]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame backgroundColor={theme.colors.backgroundLighter}>
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps='handled'
          extraScrollHeight={20}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
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
            }}
          >
            {i18n.t('monthGoalEditor.title', { month: monthLabel })}
          </Text>

          <View
            style={{
              gap: 16,
              padding: 16,
              borderRadius: theme.numbers.borderRadiusMd,
              backgroundColor: theme.colors.background,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('monthGoalEditor.regularGoal')}
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('md'),
                }}
              >
                {regularGoalDisplay.formatted}
              </Text>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: theme.colors.border,
              }}
            />

            <View style={{ gap: 8 }}>
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={i18n.t('monthGoalEditor.monthGoal')}
                accessibilityHint={i18n.t('monthGoalEditor.inputHint')}
                hitSlop={{ top: 8, bottom: 8 }}
                onPress={() => inputRef.current?.focus()}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('md'),
                  }}
                >
                  {i18n.t('monthGoalEditor.monthGoal')}
                </Text>
              </Pressable>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <TextInput
                  ref={inputRef}
                  accessibilityLabel={i18n.t('monthGoalEditor.monthGoal')}
                  accessibilityHint={i18n.t('monthGoalEditor.inputHint')}
                  value={draftGoal}
                  onChangeText={(value) => {
                    setDraftGoal(normalizeDecimalInput(value))
                    setShowValidationError(false)
                  }}
                  onSubmitEditing={() => inputRef.current?.blur()}
                  keyboardType='decimal-pad'
                  returnKeyType='done'
                  selectTextOnFocus
                  maxLength={7}
                  textAlign='left'
                  style={{
                    flex: 1,
                    minHeight: 46,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: showValidationError
                      ? theme.colors.error
                      : theme.colors.border,
                    borderRadius: theme.numbers.borderRadiusSm,
                    color: theme.colors.text,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('lg'),
                    backgroundColor: theme.colors.backgroundLighter,
                  }}
                />
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('md'),
                  }}
                >
                  {i18n.t('hours_lowercase')}
                </Text>
              </View>
              {showValidationError && (
                <Text
                  accessibilityRole='alert'
                  style={{
                    color: theme.colors.error,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('monthGoalEditor.invalidGoal')}
                </Text>
              )}
            </View>
          </View>

          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: 20,
            }}
          >
            {annualGoalHours === null
              ? i18n.t('monthGoalEditor.explanationWithoutAnnualGoal', {
                  month: monthLabel,
                })
              : i18n.t('monthGoalEditor.explanation', { month: monthLabel })}
          </Text>

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
            disabled={!hasValidGoal}
            onPress={handleSave}
          >
            {i18n.t('save')}
          </ActionButton>
        </KeyboardAwareScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default MonthGoalEditorSheet
