import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'

const mocks = vi.hoisted(() => ({ enabled: false, status: vi.fn() }))
vi.mock('@/lib/featureFlags', () => ({ useFeatureFlag: () => mocks.enabled }))
vi.mock('@/features/notes-import/lib/notesImportClient', () => ({
  getNotesImportStatus: mocks.status,
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.42.0' } },
}))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.enabled = false
})

const schedule = {
  imports: { free: 5, supporter: null },
  refinements: { free: 5, supporter: null },
  windowDays: 30,
}

async function mount() {
  const { createElement } = await import('react')
  const { create, act } = await import('react-test-renderer')
  const { useNotesImportAvailability } = await import(
    './useNotesImportAvailability'
  )
  const snapshots: NotesImportAvailability[] = []
  function Consumer() {
    snapshots.push(useNotesImportAvailability())
    return null
  }
  let root!: ReturnType<typeof create>
  await act(async () => {
    root = create(createElement(Consumer))
  })
  return {
    snapshots,
    close: () =>
      act(async () => {
        root.unmount()
      }),
  }
}

describe('Notes Import availability', () => {
  it('does not probe or expose a schedule while the flag is closed', async () => {
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    const { snapshots, close } = await mount()
    expect(mocks.status).not.toHaveBeenCalled()
    expect(snapshots.every((s) => !s.available && s.schedule === null)).toBe(
      true
    )
    await close()
  })
  it('keeps failed status probes closed even with an enabled flag', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue(null)
    const { snapshots, close } = await mount()
    expect(snapshots.every((s) => !s.available && s.schedule === null)).toBe(
      true
    )
    expect(snapshots.at(-1)?.loading).toBe(false)
    await close()
  })
  it('opens only after both checks succeed', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    const { snapshots, close } = await mount()
    expect(snapshots[0].available).toBe(false)
    expect(snapshots.at(-1)).toMatchObject({
      available: true,
      schedule,
      loading: false,
    })
    await close()
  })
})
