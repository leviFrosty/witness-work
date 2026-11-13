export function startApp() {
  require('react-native-gesture-handler')
  require('@tamagui/native/setup-gesture-handler')
  const { registerRootComponent } = require('expo')
  const { beforeAppLoads } = require('./beforeAppLoads')

  beforeAppLoads(() => {
    require('./recordLaunchLinks')

    registerRootComponent(require('../App').default)
  })
}
