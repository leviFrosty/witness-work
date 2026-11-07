import { browserIndexedDB } from '@/lib/webStorage/browserIndexedDB'
import { createStoreDatabase } from '@/lib/webStorage/storeDatabase'

export const webStores = createStoreDatabase({ indexedDB: browserIndexedDB() })
