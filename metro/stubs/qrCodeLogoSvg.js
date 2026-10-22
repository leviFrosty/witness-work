// Stands in for react-native-qrcode-svg's LogoSVG in iOS and Android builds
// (see metro/bundleRedirects.js), which only renders for a `logoSVG` prop.
module.exports = function LogoSVG() {
  throw new Error('QRCode logoSVG is not bundled; pass a bitmap logo instead')
}
