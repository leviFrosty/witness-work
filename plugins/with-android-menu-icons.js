const { withDangerousMod } = require('expo/config-plugins')
const fs = require('node:fs/promises')
const path = require('node:path')
const symbols = require('../src/assets/android-menu-icons/symbols.json')

// MenuView resolves drawable names at runtime, so the resource shrinker must
// keep these even though no native layout references them.
module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const res = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res'
      )
      const source = path.join(__dirname, '../src/assets/android-menu-icons')
      const names = [...new Set(Object.values(symbols))]
      await fs.mkdir(path.join(res, 'drawable'), { recursive: true })
      for (const name of names) {
        await fs.copyFile(
          path.join(source, `${name}.xml`),
          path.join(res, 'drawable', `${name}.xml`)
        )
      }
      await fs.mkdir(path.join(res, 'raw'), { recursive: true })
      await fs.writeFile(
        path.join(res, 'raw/ww_menu_icons_keep.xml'),
        `<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="${names.map((name) => `@drawable/${name}`).join(',')}" />\n`
      )
      return config
    },
  ])
