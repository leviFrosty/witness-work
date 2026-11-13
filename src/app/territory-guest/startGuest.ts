export function startGuest() {
  require('react-native-gesture-handler')
  require('@tamagui/native/setup-gesture-handler')
  const { registerRootComponent } = require('expo')

  registerRootComponent(require('./TerritoryGuestRoot').default)
}
