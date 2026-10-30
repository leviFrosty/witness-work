import { createContext, useContext, useId, useState } from 'react'
import { ScrollView, type ScrollViewProps } from 'react-native'
import NativeSheet from '@/components/ui/NativeSheet'
import useTheme from '@/contexts/theme'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'
import type { SheetProps } from '@/components/ui/Sheet.types'

export type { SheetProps, SheetSnapPoint } from '@/components/ui/Sheet.types'

/** Whether the open sheet sizes to its content (no snap points). */
const FitsContentContext = createContext(true)

/**
 * A native bottom sheet: SwiftUI's sheet on iOS (a centered form sheet on iPad)
 * and Material 3's modal bottom sheet on Android. It presents above whatever is
 * on screen, native modals and form sheets included, and the system gives it
 * its drag handle, scrim, swipe-to-dismiss and keyboard avoidance.
 *
 * It also holds takeovers off (ADR 0021) while it's open: no celebration or
 * intro lands on top of a sheet the User is using. Sheets don't take focus from
 * the tabs the way a pushed screen does, so they say so themselves.
 *
 * Nothing native is mounted until the sheet first opens, and it unmounts again
 * once it has closed.
 */
function SheetRoot({
  open,
  onOpenChange,
  onClosed,
  snapPoints,
  dismissible = true,
  backgroundColor,
  accessibilityLabel,
  testID,
  children,
}: SheetProps) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const holdId = useId()
  useTakeoverHold(`sheet:${holdId}`, open)
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  if (!mounted) return null
  return (
    <NativeSheet
      open={open}
      onDismiss={() => onOpenChange(false)}
      onClosed={() => {
        setMounted(false)
        onClosed?.()
      }}
      snapPoints={snapPoints}
      dismissible={dismissible}
      backgroundColor={backgroundColor ?? theme.colors.sheet}
      colorScheme={colorScheme}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <FitsContentContext.Provider value={!snapPoints?.length}>
        {children}
      </FitsContentContext.Provider>
    </NativeSheet>
  )
}

/**
 * The sheet's scrolling content. In a sheet that fits its content it's only as
 * tall as what it holds, up to the screen, and scrolls past that; with snap
 * points it fills the rest of the sheet.
 */
function SheetScrollView({ style, ...props }: ScrollViewProps) {
  const fitsContent = useContext(FitsContentContext)
  return (
    <ScrollView
      keyboardShouldPersistTaps='handled'
      {...props}
      style={[fitsContent ? { flexGrow: 0 } : { flex: 1 }, style]}
    />
  )
}

const Sheet = Object.assign(SheetRoot, { ScrollView: SheetScrollView })

export default Sheet
