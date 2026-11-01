import * as FileSystem from 'expo-file-system/legacy'
import { MMKV } from 'react-native-mmkv'
import { logger } from '@/lib/logger'
import { parseHelpBundle } from '@/features/updates/lib/helpCenter/validate'
import type {
  HelpBundle,
  HelpLocale,
} from '@/features/updates/types/helpCenter'

const directory = () => `${FileSystem.documentDirectory}help-center/`
const bundlePath = (locale: HelpLocale) => `${directory()}${locale}.json`

let storage: MMKV | undefined
const metaStorage = () => (storage ??= new MMKV({ id: 'help-center' }))

export async function readCachedBundle(
  locale: HelpLocale
): Promise<HelpBundle | null> {
  try {
    const path = bundlePath(locale)
    if (!(await FileSystem.getInfoAsync(path)).exists) return null
    const bundle = parseHelpBundle(
      JSON.parse(await FileSystem.readAsStringAsync(path))
    )
    return bundle?.locale === locale ? bundle : null
  } catch (error) {
    logger.warn('[HelpCenter] Cached bundle unreadable', error)
    return null
  }
}

export async function writeCachedBundle(bundle: HelpBundle): Promise<void> {
  const path = bundlePath(bundle.locale)
  const temp = `${path}.tmp`
  await FileSystem.makeDirectoryAsync(directory(), { intermediates: true })
  await FileSystem.writeAsStringAsync(temp, JSON.stringify(bundle))
  await FileSystem.deleteAsync(path, { idempotent: true })
  await FileSystem.moveAsync({ from: temp, to: path })
}

export function readCachedManifest(): { etag: string; body: string } | null {
  const etag = metaStorage().getString('manifestETag')
  const body = metaStorage().getString('manifest')
  return etag && body ? { etag, body } : null
}

export function writeCachedManifest(etag: string | null, body: string) {
  if (etag) {
    metaStorage().set('manifestETag', etag)
    metaStorage().set('manifest', body)
  } else {
    metaStorage().delete('manifestETag')
    metaStorage().delete('manifest')
  }
}
