module.exports = function (api) {
  api.cache(true)

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            sources: (filename) => {
              const matches = ['src']
              const include = matches.some((match) => filename.includes(match))
              if (include) {
                console.log('Compiling: ', filename)
              } else {
                console.log('Skipping compilation: ', filename)
              }
              return include
            },
          },
        },
      ],
    ],
    plugins: [
      'react-native-reanimated/plugin',
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: true,
        },
      ],
    ],
  }
}
