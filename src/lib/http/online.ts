import { useSyncExternalStore } from 'react'
import * as Network from 'expo-network'

export type Online = boolean | null

let online: Online = null

let reported: Online = null

let simulatedOffline = false
let started = false
const listeners = new Set<() => void>()
const reconnectListeners = new Set<() => void>()

function publish(next: Online) {
  if (next === online) return
  const cameBack = online === false && next === true
  online = next
  listeners.forEach((listener) => listener())
  if (cameBack) reconnectListeners.forEach((listener) => listener())
}

function update(state: Network.NetworkState) {
  reported =
    state.isConnected === false || state.isInternetReachable === false
      ? false
      : state.isConnected === true
        ? true
        : null
  publish(simulatedOffline ? false : reported)
}

function start() {
  if (started) return
  started = true
  Network.addNetworkStateListener(update)
  void Network.getNetworkStateAsync()
    .then(update)
    .catch(() => {})
}

export function getOnline(): Online {
  start()
  return online
}

export function isKnownOffline(): boolean {
  return getOnline() === false
}

export function isDeviceOffline(kind: string): boolean {
  return kind === 'offline' && getOnline() !== true
}

export function useOnline(): Online {
  return useSyncExternalStore(
    (listener) => {
      start()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => online
  )
}

export function addReconnectListener(listener: () => void): {
  remove: () => void
} {
  start()
  reconnectListeners.add(listener)
  return { remove: () => reconnectListeners.delete(listener) }
}

export function simulateOffline(on: boolean): Online {
  start()
  simulatedOffline = on
  publish(on ? false : reported)
  return online
}
