import { browserIndexedDB } from '@/lib/webStorage/browserIndexedDB'
import { createStoreDatabase } from '@/lib/webStorage/storeDatabase'

/**
 * The page's one store database. On the web, every MMKV instance and
 * AsyncStorage read and write it (metro/bundleRedirects.js).
 */
export const webStores = createStoreDatabase({ indexedDB: browserIndexedDB() })
