import { useSyncExternalStore } from 'react'
import * as Network from 'expo-network'

/** `null` until the OS reports, and when it can't tell. */
export type Online = boolean | null

let online: Online = null
/** What the OS said last. */
let reported: Online = null
/** The dev harness's `simulateOffline`. */
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

/**
 * A failure that reads as "no connection" is the device's, not the server's: a
 * refused or dropped connection while the OS reports one means the service
 * didn't answer, which callers word differently.
 */
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

/** Runs each time the connection comes back after being offline. */
export function addReconnectListener(listener: () => void): {
  remove: () => void
} {
  start()
  reconnectListeners.add(listener)
  return { remove: () => reconnectListeners.delete(listener) }
}

/**
 * Dev harness only: reads as offline while `on`, whatever the OS says, so a
 * lost and returning connection can be driven on a simulator. Off goes back to
 * the OS's answer, and to reconnect listeners when that's online.
 */
export function simulateOffline(on: boolean): Online {
  start()
  simulatedOffline = on
  publish(on ? false : reported)
  return online
}
