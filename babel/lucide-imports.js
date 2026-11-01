const fs = require('node:fs')
const path = require('node:path')
const { parseSync } = require('@babel/core')

const PACKAGE = 'lucide-react-native'

const lucidePackageDir = (root = process.cwd()) =>
  path.resolve(
    path.dirname(require.resolve(PACKAGE, { paths: [root] })),
    '../..'
  )

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
