import { Children, Fragment, type ReactNode } from 'react'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import {
  cssColor,
  type GameIconName,
  type GamePalette,
} from '@/features/pet/art/gameUi'
import { GameIcon, GameToggle } from '@/features/pet/components/GameControls'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'

/** A row's least height, and its side padding. */
const ROW_MIN = 52
const ROW_PAD = 14

/**
 * A group of rows on a paper panel, the pet screens' settings section: an
 * optional heading over it, a line between rows, and an optional note under
 * it.
 */
export function GameSection({
  title,
  footer,
  palette,
  children,
}: {
  title?: string
  footer?: string
  palette: GamePalette
  children: ReactNode
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  const rows = Children.toArray(children).filter(Boolean)
  if (rows.length === 0) return null
  return (
    <View style={{ gap: 8 }}>
      {title && (
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: palette.inkAlt,
            marginStart: 4,
          }}
        >
          {title}
        </Text>
      )}
      <GameFrame kind='panel' palette={palette} style={{ padding: scale }}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <View
                style={{
                  height: 1,
                  marginHorizontal: ROW_PAD,
                  backgroundColor: cssColor(palette.line),
                }}
              />
            )}
            {row}
          </Fragment>
        ))}
      </GameFrame>
      {footer && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: palette.inkAlt,
            marginStart: 4,
          }}
        >
          {footer}
        </Text>
      )}
    </View>
  )
}

/** A row's label and the line under it. */
function RowText({
  label,
  description,
  palette,
}: {
  label: string
  description?: string
  palette: GamePalette
}) {
  const theme = useTheme()
  return (
    <View style={{ flexShrink: 1, gap: 2 }}>
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: palette.ink,
        }}
      >
        {label}
      </Text>
      {description ? (
        <Text style={{ fontSize: theme.fontSize('sm'), color: palette.inkAlt }}>
          {description}
        </Text>
      ) : null}
    </View>
  )
}

const rowStyle = {
  minHeight: Math.max(ROW_MIN, MIN_TOUCH_TARGET),
  paddingHorizontal: ROW_PAD,
  paddingVertical: 10,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 12,
}

/**
 * A row that opens something: its label, the value it holds, and a chevron (or
 * `icon`, for a row that does something here, like play a sample).
 */
export function GameRow({
  label,
  description,
  value,
  icon = 'forward',
  onPress,
  palette,
  testID,
}: {
  label: string
  description?: string
  /** What it's set to now, before the chevron. */
  value?: string
  icon?: GameIconName
  onPress: () => void
  palette: GamePalette
  testID?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={description}
      pointerEffect='tint'
      testID={testID}
      style={rowStyle}
    >
      <View style={{ flex: 1 }}>
        <RowText label={label} description={description} palette={palette} />
      </View>
      {value ? (
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            maxWidth: '50%',
            fontSize: theme.fontSize('md'),
            color: palette.inkAlt,
          }}
        >
          {value}
        </Text>
      ) : null}
      <GameIcon
        name={icon}
        color={icon === 'forward' ? palette.inkAlt : palette.ink}
      />
    </Button>
  )
}

/**
 * A row of choices under a label, the picked one a cloth tab in the accent, as
 * the room's categories are: Reward sounds' Punch, Retro, Soft, Off.
 */
export function GameChoiceRow<Choice extends string>({
  label,
  choices,
  value,
  onChange,
  columns,
  palette,
}: {
  label: string
  choices: readonly { key: Choice; label: string }[]
  value: Choice
  onChange: (choice: Choice) => void
  /** Wraps the choices into rows this many wide; one row when unset. */
  columns?: number
  palette: GamePalette
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  return (
    <View style={{ paddingHorizontal: ROW_PAD, paddingVertical: 10, gap: 8 }}>
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: palette.ink,
        }}
      >
        {label}
      </Text>
      <View
        accessibilityRole='radiogroup'
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
      >
        {choices.map((choice) => {
          const on = choice.key === value
          return (
            <Button
              key={choice.key}
              onPress={() => onChange(choice.key)}
              accessibilityRole='radio'
              accessibilityState={{ checked: on }}
              accessibilityLabel={choice.label}
              testID={`game-choice-${choice.key}`}
              style={
                columns
                  ? { flexBasis: `${100 / columns - 4}%`, flexGrow: 1 }
                  : { flex: 1 }
              }
            >
              <GameFrame
                kind={on ? 'tab' : 'pill'}
                palette={palette}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 2 * scale,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: theme.fontSize('sm'),
                    fontFamily: on ? theme.fonts.bold : theme.fonts.semiBold,
                    color: on ? palette.onAccent : palette.inkAlt,
                  }}
                >
                  {choice.label}
                </Text>
              </GameFrame>
            </Button>
          )
        })}
      </View>
    </View>
  )
}

/**
 * A row with a switch. The whole row flips it; with `info` the switch alone
 * does, so the info button beside the label stays its own.
 */
export function GameSwitchRow({
  label,
  description,
  info,
  value,
  onValueChange,
  palette,
}: {
  label: string
  description?: string
  /** Help in a popover after the label. */
  info?: string
  value: boolean
  onValueChange: (value: boolean) => void
  palette: GamePalette
}) {
  const toggle = (
    <Button
      onPress={() => onValueChange(!value)}
      accessibilityRole='switch'
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={description}
      pointerEffect={info ? 'highlight' : 'tint'}
      style={
        info
          ? { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }
          : rowStyle
      }
    >
      {!info && (
        <View style={{ flex: 1 }}>
          <RowText label={label} description={description} palette={palette} />
        </View>
      )}
      <GameToggle value={value} palette={palette} />
    </Button>
  )
  if (!info) return toggle
  return (
    <View style={[rowStyle, { paddingVertical: 4 }]}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        {/* The switch reads the label. */}
        <View
          style={{ flexShrink: 1 }}
          importantForAccessibility='no-hide-descendants'
          accessibilityElementsHidden
        >
          <RowText label={label} description={description} palette={palette} />
        </View>
        <InfoPopover
          inline
          title={label}
          description={info}
          color={palette.inkAlt}
        />
      </View>
      {toggle}
    </View>
  )
}
