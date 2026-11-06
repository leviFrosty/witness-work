const path = require('node:path')

const SOURCE_DIR = path.join(__dirname, '..', 'src') + path.sep

/** Where the web's screen loader lives; Metro resolves the alias. */
const LAZY_SCREEN = '@/lib/lazyScreen'

/** Gates whose loader moves into its own chunk on the web. */
const GATES = new Set(['canvasKitComponent', 'canvasKitScreen'])

const isWeb = (state) => state.file.opts.caller?.platform === 'web'

/** `getComponent` as a JSX attribute or an object property. */
const isGetComponentValue = (fn) => {
  const parent = fn.parentPath
  if (parent.isJSXExpressionContainer())
    return (
      parent.parentPath.isJSXAttribute() &&
      parent.parentPath.node.name.name === 'getComponent'
    )
  if (parent.isObjectProperty() && parent.node.value === fn.node)
    return (
      !parent.node.computed &&
      (parent.node.key.name ?? parent.node.key.value) === 'getComponent'
    )
  return false
}

/** The first argument of `canvasKitComponent(…)` or `canvasKitScreen(…)`. */
const isGateLoader = (fn) => {
  const call = fn.parentPath
  return (
    call.isCallExpression() &&
    call.node.arguments[0] === fn.node &&
    call.get('callee').isIdentifier() &&
    GATES.has(call.node.callee.name)
  )
}

/**
 * `require('x').name`, perhaps under a TypeScript `as`: the module and the
 * export it reads. Anything else is left as it is.
 */
const requiredExport = (t, body) => {
  let node = body
  while (t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node))
    node = node.expression
  if (!t.isMemberExpression(node) || node.computed) return null
  const call = node.object
  if (
    !t.isCallExpression(call) ||
    !t.isIdentifier(call.callee, { name: 'require' }) ||
    call.arguments.length !== 1 ||
    !t.isStringLiteral(call.arguments[0])
  )
    return null
  return { source: call.arguments[0].value, name: node.property.name }
}

/** `import('x').then((module) => module.name)` */
const importExport = (t, { source, name }) =>
  t.callExpression(
    t.memberExpression(
      t.callExpression(t.import(), [t.stringLiteral(source)]),
      t.identifier('then')
    ),
    [
      t.arrowFunctionExpression(
        [t.identifier('module')],
        t.memberExpression(t.identifier('module'), t.identifier(name))
      ),
    ]
  )

/**
 * On the web, moves the app's screens and its Skia code out of the entry chunk
 * (docs/web-performance.md):
 *
 * - `getComponent={() => require('x').default}` becomes a component made once by
 *   `lazyScreen(() => import('x')…)`, so each screen downloads its own chunk
 *   the first time it opens.
 * - The loader of `canvasKitComponent(() => require('x').Name)` and
 *   `canvasKitScreen(…)` imports `x` instead, so Skia's code is fetched with
 *   CanvasKit, not at launch.
 *
 * IOS and Android builds aren't touched: their screens keep loading with
 * `require`. Only files under `src/` are rewritten.
 */
module.exports = function webLazyImports({ types: t }) {
  return {
    name: 'web-lazy-imports',
    visitor: {
      Program(program, state) {
        if (!isWeb(state)) return
        if (!state.filename?.startsWith(SOURCE_DIR)) return
        const screens = []
        program.traverse({
          ArrowFunctionExpression(fn) {
            if (fn.node.params.length > 0) return
            const target = requiredExport(t, fn.node.body)
            if (!target) return
            if (isGateLoader(fn)) {
              fn.get('body').replaceWith(importExport(t, target))
              return
            }
            if (!isGetComponentValue(fn)) return
            const id = program.scope.generateUidIdentifier('LazyScreen')
            screens.push(
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  id,
                  t.callExpression(t.identifier('__wwLazyScreen'), [
                    t.arrowFunctionExpression([], importExport(t, target)),
                  ])
                ),
              ])
            )
            fn.get('body').replaceWith(t.cloneNode(id))
          },
        })
        if (screens.length === 0) return
        const body = program.get('body')
        const lastImport = body.filter((statement) =>
          statement.isImportDeclaration()
        )
        const declarations = [
          t.importDeclaration(
            [
              t.importSpecifier(
                t.identifier('__wwLazyScreen'),
                t.identifier('lazyScreen')
              ),
            ],
            t.stringLiteral(LAZY_SCREEN)
          ),
          ...screens,
        ]
        // After the file's imports, which become `require`s in place: the
        // screens are made once, as the module loads.
        if (lastImport.length > 0)
          lastImport[lastImport.length - 1].insertAfter(declarations)
        else program.unshiftContainer('body', declarations)
      },
    },
  }
}
