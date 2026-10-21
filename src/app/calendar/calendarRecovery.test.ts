import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  os: 'ios',
  foreground: () => {},
  granted: { read: true, write: true },
}))
const bridge = vi.hoisted(() => ({ requestAccess: vi.fn() }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
  PermissionsAndroid: {
    PERMISSIONS: { READ_CALENDAR: 'read', WRITE_CALENDAR: 'write' },
    check: vi.fn(
      async (permission: 'read' | 'write') => runtime.granted[permission]
    ),
  },
}))
vi.mock('../../../modules/calendar-bridge', () => ({
  calendarBridge: () => bridge,
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    runtime.foreground = listener
    return { remove: vi.fn() }
  },
}))
vi.mock('@/stores/calendarSync', async () => {
  const { create } = await import('zustand')
  return {
    useCalendarPublishing: create(() => ({
      error: null as string | null,
      working: false,
    })),
  }
})

import { PermissionsAndroid } from 'react-native'
import { calendarRecovery } from '@/app/calendar/calendarRecovery'
import {
  calendarAccessAllowed,
  resumeWhenCalendarAllowed,
} from '@/app/calendar/resumeWhenCalendarAllowed'
import { useCalendarPublishing } from '@/stores/calendarSync'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('calendarRecovery', () => {
  it('sends permission errors to Settings on both platforms', () => {
    expect(calendarRecovery('calendarPermissionError')).toBe('open_settings')
    expect(calendarRecovery('calendarPermissionErrorAndroid')).toBe(
      'open_settings'
    )
  })
  it('offers Try Again for connection and create failures', () => {
    expect(calendarRecovery('calendarConnectionError')).toBe('try_again')
    expect(calendarRecovery('calendarConnectionErrorAndroid')).toBe('try_again')
    expect(calendarRecovery('calendarCreateError')).toBe('try_again')
    expect(calendarRecovery('calendarNoSourceError')).toBe('try_again')
  })
  it('offers nothing where repeating the same step would not help', () => {
    expect(calendarRecovery(null)).toBeNull()
    expect(calendarRecovery('calendarPrimaryRequired')).toBeNull()
    expect(calendarRecovery('calendarWaitingForEvents')).toBeNull()
    expect(calendarRecovery('calendarAccountChanged')).toBeNull()
    expect(calendarRecovery('calendarBinaryError')).toBeNull()
  })
})

describe('resumeWhenCalendarAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.os = 'ios'
    runtime.granted = { read: true, write: true }
    bridge.requestAccess.mockResolvedValue(true)
    useCalendarPublishing.setState({
      error: 'calendarPermissionError',
      working: false,
    })
  })

  it('resumes once access is allowed on return', async () => {
    const resume = vi.fn()
    resumeWhenCalendarAllowed(resume)
    runtime.foreground()
    await settle()
    expect(bridge.requestAccess).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalledTimes(1)
  })
  it('waits while access is still denied', async () => {
    bridge.requestAccess.mockResolvedValue(false)
    const resume = vi.fn()
    resumeWhenCalendarAllowed(resume)
    runtime.foreground()
    await settle()
    expect(resume).not.toHaveBeenCalled()
  })
  it('treats a failed check as denied', async () => {
    bridge.requestAccess.mockRejectedValue(new Error('CALENDAR_PERMISSION'))
    const resume = vi.fn()
    resumeWhenCalendarAllowed(resume)
    runtime.foreground()
    await settle()
    expect(resume).not.toHaveBeenCalled()
  })
  it('does nothing without a permission error', async () => {
    useCalendarPublishing.setState({ error: 'calendarConnectionError' })
    const resume = vi.fn()
    resumeWhenCalendarAllowed(resume)
    runtime.foreground()
    await settle()
    expect(bridge.requestAccess).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })
  it('skips resuming when the error cleared during the check', async () => {
    let allow!: (allowed: boolean) => void
    bridge.requestAccess.mockReturnValue(
      new Promise((resolve) => {
        allow = resolve
      })
    )
    const resume = vi.fn()
    resumeWhenCalendarAllowed(resume)
    runtime.foreground()
    useCalendarPublishing.setState({ error: null })
    allow(true)
    await settle()
    expect(resume).not.toHaveBeenCalled()
  })
  it('leaves an Android permission dialog to the action that opened it', async () => {
    runtime.os = 'android'
    useCalendarPublishing.setState({
      error: 'calendarPermissionErrorAndroid',
      working: true,
    })
    const resume = vi.fn()
    resumeWhenCalendarAllowed(resume)
    runtime.foreground()
    await settle()
    expect(resume).not.toHaveBeenCalled()
  })
  it('checks Android permissions without asking for them', async () => {
    runtime.os = 'android'
    useCalendarPublishing.setState({ error: 'calendarPermissionErrorAndroid' })
    const resume = vi.fn()
    resumeWhenCalendarAllowed(resume)
    runtime.foreground()
    await settle()
    expect(PermissionsAndroid.check).toHaveBeenCalledTimes(2)
    expect(bridge.requestAccess).not.toHaveBeenCalled()
    expect(resume).toHaveBeenCalledTimes(1)
  })
  it('needs both Android calendar permissions', async () => {
    runtime.os = 'android'
    runtime.granted = { read: true, write: false }
    expect(await calendarAccessAllowed()).toBe(false)
  })
})
