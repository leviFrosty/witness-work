// Stands in for @revenuecat/purchases-js-hybrid-mappings in iOS and Android
// builds (see metro/bundleRedirects.js). react-native-purchases only reads it
// in browser mode, which needs a missing native module.
module.exports = {
  get PurchasesCommon() {
    throw new Error('RevenueCat browser mode is not bundled in native builds')
  },
}
