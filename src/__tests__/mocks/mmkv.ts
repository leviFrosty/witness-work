export const hasMigratedFromAsyncStorage = () => true

export const isStorageLocked = () => false

export const MmkvStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const GuardedAsyncStorage = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
}

export const PersistStorage = MmkvStorage
