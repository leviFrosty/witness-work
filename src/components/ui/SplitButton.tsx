import React, { PropsWithChildren } from 'react'
import { Pressable, View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown'

import AnchoredPopover from '@/components/ui/AnchoredPopover'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Haptics from '@/lib/haptics'
import useTheme from '@/contexts/theme'
import { ThemeSizes } from '@/types/theme'

export type SplitButtonAction = {
  id: string
  title: string
  icon: IconDefinition
}

type Props = {
  /** Fires when the primary (left) segment is pressed. */
  onPress: () => unknown
  /** Options shown in the popover opened by the chevron segment. */
  actions: SplitButtonAction[]
  /**
   * Fires with the selected action's id. By convention the caller updates what
   * the primary segment does (e.g. the default submission method).
   */
  onSelectAction: (actionId: string) => void
  /** Header text shown at the top of the popover. */
  menuTitle?: string
  /** Action rendered with a checkmark (e.g. the current default). */
  selectedActionId?: string
  /**
   * Fires when the popover opens. Use it to commit or blur any active text
   * input before the popover takes over the screen.
   */
  onOpenMenu?: () => void
  /** Accessibility label for the chevron segment. */
  menuAccessibilityLabel?: string
  /**
   * Disables the primary segment only — the chevron stays interactive so the
   * user can switch to an action that is available.
   */
  disabled?: boolean
  size?: ThemeSizes
}

const POPOVER_WIDTH = 260

/**
 * Split button: a primary action on the left and a chevron segment on the right
 * that opens a popover of alternative actions.
 *
 * The popover is the app's JS-rendered `AnchoredPopover`, NOT a native `UIMenu`
 * (`@react-native-menu/menu`): on RN 0.83 every Fabric view claims
 * first-responder eligibility (react-native#56366, fixed in 0.86), so
 * presenting a native menu makes UIKit promote a plain view and re-summon the
 * software keyboard once any TextInput was ever focused. A JS popover never
 * presents a native overlay, so it sidesteps the bug entirely.
 */
const SplitButton = ({
  onPress,
  actions,
  onSelectAction,
  menuTitle,
  selectedActionId,
  onOpenMenu,
  menuAccessibilityLabel,
  disabled,
  size = 'lg',
  children,
}: PropsWithChildren<Props>) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: theme.numbers.borderRadiusSm,
        overflow: 'hidden',
      }}
    >
      <Button
        style={{
          flex: 1,
          backgroundColor: disabled
            ? theme.colors.accentAlt
            : theme.colors.accent,
          paddingVertical: 12,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPress={onPress}
        disabled={disabled}
      >
        {typeof children === 'string' ? (
          <Text
            style={{
              fontSize: theme.fontSize(size),
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </Button>
      <View
        style={{
          width: 1,
          backgroundColor: theme.colors.textInverse,
          opacity: 0.35,
        }}
      />
      <AnchoredPopover
        contentWidth={POPOVER_WIDTH}
        contentStyle={{ padding: 6 }}
        resolvePosition={({ anchor, windowWidth, windowHeight }) => {
          const margin = 12
          // Right-align to the chevron and open upward — the split button
          // lives at the bottom of its screens.
          const left = Math.min(
            Math.max(margin, anchor.x + anchor.width - POPOVER_WIDTH),
            windowWidth - POPOVER_WIDTH - margin
          )
          return { bottom: windowHeight - anchor.y + 8, left }
        }}
        renderTrigger={({ onPress: openPopover, anchorRef }) => (
          <View
            ref={anchorRef}
            collapsable={false}
            style={{ alignSelf: 'stretch' }}
          >
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={menuAccessibilityLabel}
              onPress={() => {
                Haptics.light()
                onOpenMenu?.()
                openPopover()
              }}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: theme.colors.accent,
                opacity: pressed ? 0.7 : 1,
                paddingVertical: 12,
                paddingHorizontal: 18,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <FontAwesomeIcon
                icon={faChevronDown}
                size={14}
                style={{ color: theme.colors.textInverse }}
              />
            </Pressable>
          </View>
        )}
      >
        {({ close }) => (
          <View>
            {menuTitle && (
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  paddingHorizontal: 10,
                  paddingTop: 6,
                  paddingBottom: 4,
                }}
              >
                {menuTitle}
              </Text>
            )}
            {actions.map((action) => {
              const selected = action.id === selectedActionId
              return (
                <Pressable
                  key={action.id}
                  accessibilityRole='button'
                  accessibilityState={{ selected }}
                  onPress={() => {
                    close()
                    onSelectAction(action.id)
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 11,
                    borderRadius: theme.numbers.borderRadiusSm,
                    backgroundColor: pressed
                      ? theme.colors.backgroundLighter
                      : undefined,
                  })}
                >
                  <FontAwesomeIcon
                    icon={action.icon}
                    size={15}
                    style={{ color: theme.colors.text }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: theme.fontSize('md'),
                      color: theme.colors.text,
                    }}
                  >
                    {action.title}
                  </Text>
                  {selected && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      size={14}
                      style={{ color: theme.colors.accent }}
                    />
                  )}
                </Pressable>
              )
            })}
          </View>
        )}
      </AnchoredPopover>
    </View>
  )
}

export default SplitButton
