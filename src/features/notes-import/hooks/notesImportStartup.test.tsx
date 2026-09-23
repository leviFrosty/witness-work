import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: 'ios',
  enabled: true,
  prepare: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn(),
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platform
    },
  },
}))
vi.mock('@/lib/featureFlags', () => ({ useFeatureFlag: () => mocks.enabled }))
vi.mock('@/features/notes-import/lib/notesImportAppAttestRuntime', () => ({
  prepareNotesImportAppAttestRecovery: mocks.prepare,
}))
vi.mock('@/features/notes-import/hooks/useNotesImportManager', () => ({
  useNotesImportManager: {
    getState: () => ({ appBecameActive: mocks.resume }),
  },
}))

import NotesImportAttestPreparation from '@/features/notes-import/components/NotesImportAttestPreparation'
import { useNotesImportResume } from '@/features/notes-import/hooks/useNotesImportResume'

function Startup() {
  useNotesImportResume()
  return <NotesImportAttestPreparation />
}

beforeEach(() => vi.clearAllMocks())

it.each([
  { platform: 'android', enabled: true, calls: 0 },
  { platform: 'ios', enabled: false, calls: 0 },
  { platform: 'ios', enabled: true, calls: 1 },
])(
  'prepares authentication and resumes imports only on enabled iOS ($platform, $enabled)',
  async ({ platform, enabled, calls }) => {
    mocks.platform = platform
    mocks.enabled = enabled
    let root!: ReturnType<typeof create>
    await act(async () => {
      root = create(<Startup />)
    })
    expect(mocks.prepare).toHaveBeenCalledTimes(calls)
    expect(mocks.resume).toHaveBeenCalledTimes(calls)
    await act(async () => root.unmount())
  }
)
