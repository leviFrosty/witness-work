import * as DeviceSecrets from '../../../modules/device-secrets'
import {
  type KeyChangeRecordStore,
  parseKeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'

const SECRET = 'account-key-change'

/**
 * IOS and Android: a this-device-only Keychain item, or a file sealed under the
 * Android Keystore that Auto Backup skips (`modules/device-secrets`). Throws on
 * a binary without the module: a key change needs somewhere safe to keep both
 * keys, so it doesn't start there (`isAvailable`).
 *
 * TODO(W5 web): the web supplies its sealed IndexedDB store with this same
 * interface.
 */
export const nativeKeyChangeRecordStore: KeyChangeRecordStore & {
  isAvailable: () => boolean
} = {
  isAvailable: DeviceSecrets.isAvailable,
  read: async () => parseKeyChangeRecord(await DeviceSecrets.read(SECRET)),
  write: (record) => DeviceSecrets.write(SECRET, JSON.stringify(record)),
  remove: () => DeviceSecrets.remove(SECRET),
}
