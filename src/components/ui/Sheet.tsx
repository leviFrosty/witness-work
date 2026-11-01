import { createContext, useContext, useId, useState } from 'react'
import { ScrollView, type ScrollViewProps } from 'react-native'
import NativeSheet from '@/components/ui/NativeSheet'
import useTheme from '@/contexts/theme'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'
import type { SheetProps } from '@/components/ui/Sheet.types'

export type { SheetProps, SheetSnapPoint } from '@/components/ui/Sheet.types'

const FitsContentContext = createContext(true)

function SheetRoot({
  open,
  onOpenChange,
  onClosed,
  snapPoints,
  dismissible = true,
  backgroundColor,
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
      testID={testID}
    >
      <FitsContentContext.Provider value={!snapPoints?.length}>
        {children}
      </FitsContentContext.Provider>
    </NativeSheet>
  )
}

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
