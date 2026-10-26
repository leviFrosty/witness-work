const path = require('path')

const appSourceDir = path.join(__dirname, 'src') + path.sep

module.exports = function (api) {
  api.cache(true)

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            sources: (filename) => filename.startsWith(appSourceDir),
          },
        },
      ],
    ],
    plugins: [
      './babel/lucide-imports',
      'react-native-reanimated/plugin',
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: true,
        },
      ],
      // Loads DOM components (the note editor) from the applied OTA update's
      // www.bundle; without it they look in the binary's, which lacks the
      // update's content-hashed HTML.
      '@hot-updater/expo/babel-plugin',
    ],
  }
}
