import { type ReactNode, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeftRight as ArrowLeftRightIcon,
  Ban as BanIcon,
  ChevronUp as ChevronUpIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { UndoIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import DoorOutcomeButtons from '@/features/territories/components/DoorOutcomeButtons'
import DoorStepper from '@/features/territories/components/DoorStepper'
import type { DoorOutcome } from '@/features/territories/types/territory'

export type DoorDescription = {
  value: string

  canSave: boolean

  pinned: boolean
  onChange: (value: string) => void
  onSave: () => void
  onBack: () => void
}

export type DoorUndo = {
  icon: AppIcon
  color: string
  text: string
  label: string
  onPress: () => void
}

export type DoorRecorderStow = {
  stowed: boolean
  onChange: (stowed: boolean) => void
}

const PAD_TOP = 10
const STOWED_PAD = 8
const SPRING = { damping: 22, stiffness: 260, mass: 0.8 }

export default function DoorRecorder({
  caption,
  label,
  numbered,
  blocked,
  editing,
  doorTitle,
  back,
  describing,
  undo,
  onChangeLabel,
  onStep,
  onPick,
  onSkip,
  onFinishStreet,
  switchSide,
  pinControl,
  notice,
  stow,
  onLayout,
}: {
  caption: string
  label: string
  numbered: boolean

  blocked: boolean

  editing: boolean

  doorTitle: string
  back: { label: string; onPress: () => void } | null

  describing: DoorDescription | null

  undo?: DoorUndo | null
  onChangeLabel: (label: string) => void
  onStep: (direction: 1 | -1) => void
  onPick: (outcome: DoorOutcome) => void
  onSkip: () => void

  onFinishStreet: (() => void) | null

  switchSide: { label: string; onPress: () => void } | null

  pinControl?: ReactNode

  notice?: ReactNode

  stow?: DoorRecorderStow

  onLayout: (height: number) => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [height, setHeight] = useState(0)
  const stowed = !!stow?.stowed
  const stowedHeight = PAD_TOP + MIN_TOUCH_TARGET + STOWED_PAD + insets.bottom
  const progress = useSharedValue(stowed ? 1 : 0)
  const travel = useSharedValue(0)
  const start = useSharedValue(0)

  useEffect(() => {
    travel.value = Math.max(0, height - stowedHeight)
  }, [height, stowedHeight, travel])

  useEffect(() => {
    progress.value = withSpring(stowed ? 1 : 0, SPRING)
  }, [stowed, progress])

  useEffect(() => {
    if (height > 0) onLayout(stowed ? stowedHeight : height)
  }, [height, stowed, stowedHeight, onLayout])

  const settle = (down: boolean) => stow?.onChange(down)

  const pan = Gesture.Pan()
    .enabled(!!stow && !describing)
    .activeOffsetY([-10, 10])
    .failOffsetX([-24, 24])
    .onBegin(() => {
      start.value = progress.value
    })
    .onUpdate((event) => {
      if (travel.value <= 0) return
      progress.value = Math.min(
        1,
        Math.max(0, start.value + event.translationY / travel.value)
      )
    })
    .onEnd((event) => {
      const down =
        event.velocityY > 500 ||
        (event.velocityY > -500 && progress.value > 0.5)
      progress.value = withSpring(down ? 1 : 0, SPRING)
      scheduleOnRN(settle, down)
    })

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * travel.value }],
  }))
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], 'clamp'),
  }))

  const wide = {
    minHeight: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.numbers.borderRadiusMd,
    borderCurve: 'continuous' as const,
  }
  const showUndo = !!undo && !describing && !blocked
  const accentText = {
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.accent,
  }

  const bar = (
    <Button
      onPress={() => stow?.onChange(false)}
      testID='door-recorder-expand'
      accessibilityLabel={`${i18n.t('territories.pins.showRecorder')}, ${doorTitle}`}
      accessibilityHint={caption}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: MIN_TOUCH_TARGET,
      }}
    >
      <LucideIcon icon={ChevronUpIcon} size={20} color={theme.colors.accent} />
      <Text
        style={{ fontFamily: theme.fonts.bold, fontSize: theme.fontSize('xl') }}
      >
        {doorTitle}
      </Text>
      <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.textAlt }}>
        {caption}
      </Text>
    </Button>
  )

  const top = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: MIN_TOUCH_TARGET,
        gap: 6,
      }}
    >
      {blocked && (
        <LucideIcon icon={BanIcon} size={18} color={theme.colors.error} />
      )}
      {showUndo ? (
        <Button
          onPress={undo.onPress}
          testID='door-undo'
          accessibilityLabel={`${i18n.t('undo')}, ${undo.label}`}
          style={{
            flex: 1,
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LucideIcon icon={undo.icon} size={16} color={undo.color} />
            <Text
              testID='door-last'
              numberOfLines={1}
              style={{ flexShrink: 1, fontFamily: theme.fonts.bold }}
            >
              {undo.text}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <LucideIcon icon={UndoIcon} size={14} color={theme.colors.accent} />
            <Text style={{ ...accentText, fontSize: theme.fontSize('sm') }}>
              {i18n.t('undo')}
            </Text>
          </View>
        </Button>
      ) : (
        <Text
          testID='door-caption'
          numberOfLines={2}
          style={{
            flex: 1,
            fontFamily: theme.fonts.semiBold,
            color: blocked ? theme.colors.error : theme.colors.text,
          }}
        >
          {caption}
        </Text>
      )}
      {!describing && !blocked && pinControl}
      {onFinishStreet && !describing && !blocked && !editing && (
        <Button
          onPress={onFinishStreet}
          testID='street-finish'
          style={{
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            paddingHorizontal: 12,
            borderRadius: MIN_TOUCH_TARGET / 2,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('territories.finishStreet')}
          </Text>
        </Button>
      )}
    </View>
  )

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID='door-recorder'
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={[
          {
            backgroundColor: theme.colors.card,
            borderTopStartRadius: inputLayout.sectionRadius,
            borderTopEndRadius: inputLayout.sectionRadius,
            borderCurve: 'continuous',
            borderTopWidth: editing || blocked ? 2 : 1,
            borderColor: blocked
              ? theme.colors.error
              : editing
                ? theme.colors.text
                : theme.colors.border,
          },
          slide,
        ]}
      >
        {stow && (
          <Pressable
            onPress={() => stow.onChange(!stowed)}
            accessibilityRole='button'
            accessibilityLabel={i18n.t(
              stowed
                ? 'territories.pins.showRecorder'
                : 'territories.pins.hideRecorder'
            )}
            testID='door-recorder-grabber'
            style={{
              position: 'absolute',
              top: 0,
              alignSelf: 'center',
              width: 72,
              height: PAD_TOP,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
              }}
            />
          </Pressable>
        )}
        <ContentColumn
          style={{
            paddingTop: PAD_TOP,
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 14,
            gap: 12,
          }}
        >
          {stowed ? bar : top}
          <Animated.View
            pointerEvents={stowed ? 'none' : 'auto'}
            accessibilityElementsHidden={stowed}
            importantForAccessibility={stowed ? 'no-hide-descendants' : 'auto'}
            style={[{ gap: 12 }, fade]}
          >
            {!describing && notice}
            {describing ? (
              <View style={{ gap: 12 }}>
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('territories.describeDoor')}
                </Text>
                <TextInput
                  value={describing.value}
                  onChangeText={describing.onChange}
                  onSubmitEditing={() =>
                    describing.canSave && describing.onSave()
                  }
                  placeholder={i18n.t('territories.describeDoor_placeholder')}
                  accessibilityLabel={i18n.t('territories.describeDoor')}
                  returnKeyType='done'
                  textAlign='start'
                  autoFocus
                  maxLength={80}
                  testID='door-description'
                />
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t(
                    describing.pinned
                      ? 'territories.describeDoor_hintPinned'
                      : 'territories.describeDoor_hint'
                  )}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    onPress={describing.onBack}
                    testID='door-description-back'
                    style={{
                      ...wide,
                      paddingHorizontal: 22,
                      backgroundColor: theme.colors.backgroundLighter,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.semiBold }}>
                      {i18n.t('cancel')}
                    </Text>
                  </Button>
                  <Button
                    onPress={describing.onSave}
                    disabled={!describing.canSave}
                    testID='door-description-save'
                    style={{
                      ...wide,
                      flex: 1,
                      opacity: describing.canSave ? 1 : 0.5,
                      borderWidth: 1.5,
                      borderColor: theme.colors.error,
                      backgroundColor: `${theme.colors.error}22`,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.bold }}>
                      {i18n.t('territories.describeDoor_save')}
                    </Text>
                  </Button>
                </View>
              </View>
            ) : (
              <>
                {numbered ? (
                  <DoorStepper
                    label={label}
                    numbered={numbered}
                    onChangeLabel={onChangeLabel}
                    onStep={onStep}
                    back={blocked ? null : back}
                  />
                ) : (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Text
                      testID='door-label'
                      style={{
                        fontFamily: theme.fonts.bold,
                        fontSize: 40,
                        lineHeight: 56,
                      }}
                    >
                      {doorTitle}
                    </Text>
                    {back && !blocked && (
                      <Button
                        onPress={back.onPress}
                        testID='door-back'
                        style={{
                          minHeight: MIN_TOUCH_TARGET,
                          paddingHorizontal: 12,
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={accentText}>{back.label}</Text>
                      </Button>
                    )}
                  </View>
                )}
                {switchSide && !back && !blocked && (
                  <Button
                    onPress={switchSide.onPress}
                    testID='door-switch-side'
                    style={{
                      flexDirection: 'row',
                      alignSelf: 'center',
                      alignItems: 'center',
                      gap: 6,
                      minHeight: MIN_TOUCH_TARGET,
                      marginVertical: -6,
                      paddingHorizontal: 12,
                    }}
                  >
                    <LucideIcon
                      icon={ArrowLeftRightIcon}
                      size={16}
                      color={theme.colors.accent}
                    />
                    <Text style={accentText}>{switchSide.label}</Text>
                  </Button>
                )}
                {blocked ? (
                  <Button
                    onPress={back ? back.onPress : onSkip}
                    testID='door-skip'
                    style={{
                      ...wide,
                      minHeight: 84,
                      borderWidth: 1.5,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.background,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.bold }}>
                      {back
                        ? back.label
                        : i18n.t(
                            numbered
                              ? 'territories.skipHouse'
                              : 'territories.skipDoor'
                          )}
                    </Text>
                  </Button>
                ) : (
                  <DoorOutcomeButtons onPick={onPick} />
                )}
              </>
            )}
          </Animated.View>
        </ContentColumn>
      </Animated.View>
    </GestureDetector>
  )
}
