import { Platform } from 'react-native'
import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core'

export type SystemMenuGroup = {
  id: 'application' | 'file' | 'edit' | 'help'
  title: string
  actions: { id: string; title: string; enabled: boolean }[]
}

type SystemMenuNative = {
  configure(groups: SystemMenuGroup[]): Promise<boolean>
  configureNavigationShortcuts?(inputs: string[]): Promise<boolean>
  addListener<Event extends keyof SystemMenuEvents>(
    event: Event,
    listener: (event: SystemMenuEvents[Event]) => void
  ): EventSubscription
}

type SystemMenuEvents = {
  onAction: { action: string }
  onCommandKeyChanged: { pressed: boolean }
  onNavigationShortcut: { input: string }
}

// Older binaries and Android can safely load the same JavaScript update.
const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<SystemMenuNative>('SystemMenu')
    : null

export const isAvailable = native !== null
export const supportsNavigationShortcuts =
  typeof native?.configureNavigationShortcuts === 'function'

export async function configure(groups: SystemMenuGroup[]): Promise<boolean> {
  return native?.configure(groups) ?? false
}

export function subscribe(listener: (event: { action: string }) => void) {
  return native?.addListener('onAction', listener)
}

export async function configureNavigationShortcuts(inputs: string[]) {
  return native?.configureNavigationShortcuts?.(inputs) ?? false
}

export function subscribeToCommandKey(
  listener: (event: { pressed: boolean }) => void
) {
  if (supportsNavigationShortcuts)
    return native?.addListener('onCommandKeyChanged', listener)
}

export function subscribeToNavigationShortcut(
  listener: (event: { input: string }) => void
) {
  if (supportsNavigationShortcuts)
    return native?.addListener('onNavigationShortcut', listener)
}
