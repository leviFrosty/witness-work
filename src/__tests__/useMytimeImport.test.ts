import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SQLITE_HEADER_BASE64 = 'U1FMaXRlIGZvcm1hdCAzAA=='

const native = vi.hoisted(() => ({
  header: '',
  getAllAsync: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: native.captureException },
}))
vi.mock('@/features/mytime-import/lib/importMytime', () => ({
  writeMappedDataToStores: vi.fn(),
}))
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///picked/backup.mytimedb' }],
  })),
}))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  copyAsync: vi.fn(async () => undefined),
  readAsStringAsync: vi.fn(async () => native.header),
}))
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getAllAsync: native.getAllAsync,
    closeAsync: vi.fn(async () => undefined),
  })),
}))

import * as SQLite from 'expo-sqlite'
import { useMytimeImport } from '@/features/mytime-import/hooks/useMytimeImport'

type Hook = ReturnType<typeof useMytimeImport>

const renderImport = () => {
  let latest: Hook | undefined
  const Probe = ({ onResult }: { onResult: (hook: Hook) => void }) => {
    onResult(useMytimeImport({ publisherMode: 'fillIfUnset' }))
    return null
  }
  act(() => {
    create(
      createElement(Probe, {
        onResult: (hook) => {
          latest = hook
        },
      })
    )
  })
  return () => latest as Hook
}

describe('useMytimeImport — files that are not a SQLite database', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    native.header = SQLITE_HEADER_BASE64
  })

  it('shows the invalid-file message when SQLite rejects the first read', async () => {
    native.getAllAsync.mockRejectedValue(
      new Error(
        "Call to function 'NativeStatement.finalizeAsync' has been rejected.\n→ Caused by: Error code 26: file is not a database"
      )
    )
    const result = renderImport()
    await act(() => result().pickAndParse())

    expect(result().status).toBe('error')
    expect(result().errorKind).toBe('invalidFile')
    expect(native.captureException).not.toHaveBeenCalled()
  })

  it('rejects a file without the SQLite header before opening it', async () => {
    native.header = 'iVBORw0KGgoAAAANSUhEUg=='
    const result = renderImport()
    await act(() => result().pickAndParse())

    expect(SQLite.openDatabaseAsync).not.toHaveBeenCalled()
    expect(result().status).toBe('error')
    expect(result().errorKind).toBe('invalidFile')
    expect(native.captureException).not.toHaveBeenCalled()
  })

  it('still reports a genuine failure past the first read', async () => {
    native.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT name FROM sqlite_master'))
        return [{ name: 'ZCALL' }, { name: 'ZRETURNVISIT' }]
      throw new Error('Something unrelated broke')
    })
    const result = renderImport()
    await act(() => result().pickAndParse())

    expect(result().errorKind).toBe('unexpected')
    expect(native.captureException).toHaveBeenCalledTimes(1)
  })
})
