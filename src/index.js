require('./app/launch/hardenWeb').hardenWeb()

const { scrubLaunchAddress } = require('./app/launch/scrubLaunchAddress')

if (scrubLaunchAddress()) {
  require('react-native-gesture-handler')
  require('@tamagui/native/setup-gesture-handler')
  const { registerRootComponent } = require('expo')
  const { beforeAppLoads } = require('./app/launch/beforeAppLoads')

  beforeAppLoads(() => {
    require('./app/launch/recordLaunchLinks')

    registerRootComponent(require('./app/App').default)
  })
}
