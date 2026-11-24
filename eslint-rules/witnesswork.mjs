export const platformMessage =
  "`Platform.OS` against 'android' sends the web down the iOS branch. Hide the feature with hasCapability() from @/lib/platformCapabilities, or choose with Platform.select({ ios, android, web }), so the web gets a branch of its own. `if (Platform.OS !== 'android') return` guards and `*.ios.*`, `*.android.*` and `*.native.*` files are fine."

const isPlatformOS = (node) =>
  node?.type === 'MemberExpression' &&
  node.object.type === 'Identifier' &&
  node.object.name === 'Platform' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'OS'

const comparesToAndroid = (node) =>
  node.type === 'BinaryExpression' &&
  (node.operator === '===' || node.operator === '!==') &&
  ((isPlatformOS(node.left) && node.right.value === 'android') ||
    (isPlatformOS(node.right) && node.left.value === 'android'))

const isInIfCondition = (node) => {
  for (
    let child = node, parent = node.parent;
    parent;
    child = parent, parent = parent.parent
  ) {
    if (parent.type === 'IfStatement') return parent.test === child
    if (/Statement|Declaration|Function/.test(parent.type)) return false
  }
  return false
}

export const linkingOpenUrlMessage =
  'Use openURL() from @/lib/links instead of Linking.openURL(), which navigates the current tab on the web.'

const LINKING_SOURCES = new Set(['expo-linking', 'react-native'])

export default {
  rules: {
    'platform-android-choice': {
      meta: { type: 'problem', schema: [] },
      create: (context) => ({
        ConditionalExpression(node) {
          if (comparesToAndroid(node.test))
            context.report({ node: node.test, message: platformMessage })
        },
        BinaryExpression(node) {
          if (
            node.operator === '!==' &&
            comparesToAndroid(node) &&
            node.parent.type !== 'ConditionalExpression' &&
            !isInIfCondition(node)
          )
            context.report({ node, message: platformMessage })
        },
      }),
    },
    'no-direct-linking-open-url': {
      meta: { type: 'problem', schema: [] },
      create: (context) => {
        const linkingBindings = new Set()
        return {
          ImportDeclaration(node) {
            const source = node.source?.value
            if (!LINKING_SOURCES.has(source)) return
            for (const specifier of node.specifiers) {
              if (
                source === 'expo-linking' &&
                specifier.type === 'ImportSpecifier' &&
                specifier.imported?.name === 'openURL'
              ) {
                context.report({
                  node: specifier,
                  message: linkingOpenUrlMessage,
                })
              }
              if (
                source === 'expo-linking' &&
                specifier.type === 'ImportNamespaceSpecifier'
              ) {
                linkingBindings.add(specifier.local.name)
              }
              if (
                source === 'react-native' &&
                specifier.type === 'ImportSpecifier' &&
                specifier.imported?.name === 'Linking'
              ) {
                linkingBindings.add(specifier.local.name)
              }
            }
          },
          CallExpression(node) {
            const callee = node.callee
            if (
              callee?.type === 'MemberExpression' &&
              !callee.computed &&
              callee.object.type === 'Identifier' &&
              linkingBindings.has(callee.object.name) &&
              callee.property.type === 'Identifier' &&
              callee.property.name === 'openURL'
            ) {
              context.report({ node, message: linkingOpenUrlMessage })
            }
          },
        }
      },
    },
  },
}
