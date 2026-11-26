import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  addExceptionStep: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('@/lib/posthogClient', () => ({
  posthogClient: {
    captureException: mocks.captureException,
    addExceptionStep: mocks.addExceptionStep,
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))

import { errorTracking } from '@/lib/errorTracking'
import { setCrashReportsAllowed } from '@/lib/errorTrackingPolicy'

beforeEach(() => {
  vi.clearAllMocks()
  setCrashReportsAllowed(true)
})

it('reports errors and steps while crash reports are on', () => {
  errorTracking.captureException(new Error('boom'))
  errorTracking.addBreadcrumb({ category: 'sync', message: 'Upload started' })
  expect(mocks.captureException).toHaveBeenCalledOnce()
  expect(mocks.addExceptionStep).toHaveBeenCalledOnce()
})

it('reports no errors or steps once crash reports are off', () => {
  setCrashReportsAllowed(false)
  errorTracking.captureException(new Error('boom'))
  errorTracking.captureMessage('failed')
  errorTracking.addBreadcrumb({ category: 'sync', message: 'Upload started' })
  expect(mocks.captureException).not.toHaveBeenCalled()
  expect(mocks.addExceptionStep).not.toHaveBeenCalled()
})

it('still counts a full device as usage when crash reports are off', () => {
  setCrashReportsAllowed(false)
  errorTracking.captureException(new Error('No space left on device'))
  expect(mocks.capture).toHaveBeenCalledWith('device_storage_full')
  expect(mocks.captureException).not.toHaveBeenCalled()
})
