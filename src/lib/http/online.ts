import { useSyncExternalStore } from 'react'
import * as Network from 'expo-network'

/** `null` until the OS reports, and when it can't tell. */
export type Online = boolean | null

let online: Online = null
let started = false
const listeners = new Set<() => void>()
const reconnectListeners = new Set<() => void>()

function update(state: Network.NetworkState) {
  const next: Online =
    state.isConnected === false || state.isInternetReachable === false
      ? false
      : state.isConnected === true
        ? true
        : null
  if (next === online) return
  const cameBack = online === false && next === true
  online = next
  listeners.forEach((listener) => listener())
  if (cameBack) reconnectListeners.forEach((listener) => listener())
}

function start() {
  if (started) return
  started = true
  Network.addNetworkStateListener(update)
  void Network.getNetworkStateAsync()
    .then(update)
    .catch(() => {})
}

/**
 * Connectivity as the OS sees it. Only `false` is certain: a captive portal or
 * a dead server can still look online, so callers treat `true` and `null` as
 * "try it".
 */
export function getOnline(): Online {
  start()
  return online
}

export function isKnownOffline(): boolean {
  return getOnline() === false
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

/** Runs each time the connection comes back after being offline. */
export function addReconnectListener(listener: () => void): {
  remove: () => void
} {
  start()
  reconnectListeners.add(listener)
  return { remove: () => reconnectListeners.delete(listener) }
}
