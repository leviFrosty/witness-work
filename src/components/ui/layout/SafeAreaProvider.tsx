import type { ComponentProps, ReactNode } from 'react'
import { Platform } from 'react-native'
import {
  SafeAreaProvider as LibrarySafeAreaProvider,
  SafeAreaInsetsContext,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { isStandalone } from '@/lib/webInstall/standalone'
import { installedWebAppTopInset } from '@/components/ui/layout/installedWebAppTopInset'

export default function SafeAreaProvider({
  children,
  ...props
}: ComponentProps<typeof LibrarySafeAreaProvider>) {
  return (
    <LibrarySafeAreaProvider {...props}>
      {needsTopInset() ? (
        <InstalledWebAppTop>{children}</InstalledWebAppTop>
      ) : (
        children
      )}
    </LibrarySafeAreaProvider>
  )
}

function InstalledWebAppTop({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const frame = useSafeAreaFrame()
  const top = installedWebAppTopInset(insets.top, frame.y)
  return (
    <SafeAreaInsetsContext.Provider
      value={top === insets.top ? insets : { ...insets, top }}
    >
      {children}
    </SafeAreaInsetsContext.Provider>
  )
}

function needsTopInset() {
  return (
    Platform.OS === 'web' &&
    isStandalone() &&
    window.matchMedia?.('(pointer: coarse)').matches === true
  )
}
