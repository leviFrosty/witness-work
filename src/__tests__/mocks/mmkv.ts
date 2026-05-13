// Mocks `src/stores/mmkv`. The real module instantiates `new MMKV()` at
// import time, which crashes outside of a React Native runtime. Tests pull
// this in transitively whenever they touch a zustand store that uses the
// MmkvStorage adapter.
//
// Only the symbols that consumers actually reference in tests are stubbed;
// `mmkvStorage` and `migrateFromAsyncStorage` are intentionally omitted.
//
// Usage:
//   vi.mock('@/__tests__/stores/mmkv', () => import('@/__tests__/mocks/mocks/mmkv'))
export const hasMigratedFromAsyncStorage = () => true

export const MmkvStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}
