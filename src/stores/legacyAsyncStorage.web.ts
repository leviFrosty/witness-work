/**
 * The web build never saved to AsyncStorage. Its web build also reads the same
 * `localStorage` MMKV writes to, so a migration would mistake MMKV's own keys
 * for legacy data and reload to copy them on every launch.
 */
export const mayHoldLegacyAsyncStorage = false
