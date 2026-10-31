import { describe, expect, it } from 'vitest'
import { buildMytimeBackup } from '../../../../e2e/web/mytimeFixture'
import {
  canReadMytimeDb,
  readMytimeDb,
} from '@/features/mytime-import/lib/readMytimeDb.web'
import { MYTIME_MAX_FILE_BYTES } from '@/features/mytime-import/lib/readMytimeSqlite'

describe('web MyTime import', () => {
  it('is available', () => {
    expect(canReadMytimeDb).toBe(true)
  })

  it('reads the picked file, not its object URL', async () => {
    const file = new Blob([(await buildMytimeBackup()).slice().buffer])
    // sql.js loads its wasm from disk in Node; the web serves it at the root.
    const tables = await readMytimeDb('blob:http://localhost/1', file)
    expect(tables.calls).toHaveLength(3)
  })

  it('needs the file', async () => {
    await expect(readMytimeDb('blob:http://localhost/1')).rejects.toThrow()
  })

  it('refuses a file over 25 MiB without reading it', async () => {
    const huge = new Blob([new Uint8Array(MYTIME_MAX_FILE_BYTES + 1)])
    await expect(readMytimeDb('blob:x', huge)).rejects.toMatchObject({
      name: 'MytimeImportError',
      reason: 'openFailed',
    })
  })
})
