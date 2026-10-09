const fs = require('node:fs')
const path = require('node:path')
const { parseSync } = require('@babel/core')

const PACKAGE = 'lucide-react-native'

// `require.resolve` lands on dist/cjs/lucide-react-native.js (package.json
// itself isn't exported).
const lucidePackageDir = (root = process.cwd()) =>
  path.resolve(
    path.dirname(require.resolve(PACKAGE, { paths: [root] })),
    '../..'
  )

/**
 * The package's ESM index re-exports every icon (~1,750 modules). Metro doesn't
 * tree-shake, so importing from the index evaluates all of them at launch, and
 * its `exports` map has no per-icon subpaths. Reading the index tells us which
 * file backs each export name.
 *
 * Maps every value export of the index to `{ source, imported }`, where
 * `source` is a package subpath such as
 * `lucide-react-native/dist/esm/icons/plus.mjs` and `imported` is the name that
 * file exports it as (usually `default`).
 */
const readLucideExports = (packageDir = lucidePackageDir()) => {
  const code = fs.readFileSync(
    path.join(packageDir, 'dist/esm/lucide-react-native.mjs'),
    'utf8'
  )
  const ast = parseSync(code, {
    sourceType: 'module',
    babelrc: false,
    configFile: false,
  })
  const dir = path.posix.join(PACKAGE, 'dist/esm')
  const exportsByName = new Map()
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.source) continue
    const source = path.posix.join(dir, node.source.value)
    for (const specifier of node.specifiers) {
      exportsByName.set(specifier.exported.name, {
        source,
        imported: specifier.local.name,
      })
    }
  }
  return exportsByName
}

let cachedExports

/**
 * Rewrites `import { Plus, X as Close } from 'lucide-react-native'` into one
 * import per icon file (`import Close from
 * 'lucide-react-native/dist/esm/icons/x.mjs'`), so only the icons the app names
 * get bundled.
 *
 * Type-only imports are left for the TypeScript transform to strip. Names the
 * index doesn't export (types imported without `type`) stay on the original
 * import. metro.config.js resolves the rewritten subpaths past the `exports`
 * map, so other Babel callers (Jest) keep the original imports.
 */
const lucideImportsPlugin = (api) => {
  const { types: t } = api
  if (!api.caller((caller) => caller?.name === 'metro')) {
    return { name: 'lucide-imports', visitor: {} }
  }
  const exportsByName = (cachedExports ??= readLucideExports())

  return {
    name: 'lucide-imports',
    visitor: {
      ImportDeclaration(declarationPath) {
        const { node } = declarationPath
        if (node.source.value !== PACKAGE || node.importKind === 'type') return

        const kept = []
        const rewritten = []
        for (const specifier of node.specifiers) {
          const match =
            specifier.type === 'ImportSpecifier' &&
            specifier.importKind !== 'type' &&
            exportsByName.get(
              specifier.imported.name ?? specifier.imported.value
            )
          if (!match) {
            kept.push(specifier)
            continue
          }
          const local = t.identifier(specifier.local.name)
          rewritten.push(
            t.importDeclaration(
              [
                match.imported === 'default'
                  ? t.importDefaultSpecifier(local)
                  : t.importSpecifier(local, t.identifier(match.imported)),
              ],
              t.stringLiteral(match.source)
            )
          )
        }
        if (rewritten.length === 0) return

        if (kept.length === 0) {
          declarationPath.replaceWithMultiple(rewritten)
        } else {
          node.specifiers = kept
          declarationPath.insertAfter(rewritten)
        }
      },
    },
  }
}

module.exports = lucideImportsPlugin
module.exports.readLucideExports = readLucideExports
module.exports.lucidePackageDir = lucidePackageDir
