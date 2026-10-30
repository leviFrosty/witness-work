/**
 * Whether this platform may hold data saved before the app moved its stores
 * from AsyncStorage to MMKV. iOS and Android installs may (see
 * `migrateFromAsyncStorage`); the web build never used AsyncStorage
 * (`legacyAsyncStorage.web.ts`).
 */
export const mayHoldLegacyAsyncStorage = true
