import * as DeviceSecrets from '../../../modules/device-secrets'
import {
  type KeyChangeRecordStore,
  parseKeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'

const SECRET = 'account-key-change'

export const nativeKeyChangeRecordStore: KeyChangeRecordStore & {
  isAvailable: () => boolean
} = {
  isAvailable: DeviceSecrets.isAvailable,
  read: async () => parseKeyChangeRecord(await DeviceSecrets.read(SECRET)),
  write: (record) => DeviceSecrets.write(SECRET, JSON.stringify(record)),
  remove: () => DeviceSecrets.remove(SECRET),
}
