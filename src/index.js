// First, on the web: the Trusted Types policy and zod's setting the CSP needs
// (`hardenWeb.web.ts`), before any other module loads.
require('./app/launch/hardenWeb').hardenWeb()

// Then, before the app loads: on the web, checkout's ids leave the
// address before anything could read it, and a checkout return meant for
// another origin goes there without loading the app (docs/web-purchases.md
// "The return page"). Native apps go straight on. Everything else is required
// inside the `if`, in order, so nothing loads before this.
const { scrubLaunchAddress } = require('./app/launch/scrubLaunchAddress')

if (scrubLaunchAddress()) {
  require('react-native-gesture-handler')
  require('@tamagui/native/setup-gesture-handler')
  const { registerRootComponent } = require('expo')
  const { beforeAppLoads } = require('./app/launch/beforeAppLoads')

  beforeAppLoads(() => {
    // Loaded first, before the rest of the app, so a link tapped while it
    // starts isn't dropped.
    require('./app/launch/recordLaunchLinks')

    // registerRootComponent calls AppRegistry.registerComponent('main', () => App);
    // It also ensures that whether you load the app in Expo Go or in a native build,
    // the environment is set up appropriately
    registerRootComponent(require('./app/App').default)
  })
}
