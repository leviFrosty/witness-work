// Mocks `@react-native-async-storage/async-storage` so any import path
// that ends up touching it (typically through zustand persist middleware)
// resolves cleanly under vitest. The real module requires native bindings.
//
// Usage:
//   vi.mock('@react-native-async-storage/async-storage', () => import('./mocks/asyncStorage'))
export default {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
}
