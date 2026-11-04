// A binary choice on `Platform.OS === 'android'` hands the web the other branch,
// which has always been iOS's. ADR 0037: new code must not assume the web is
// iOS.
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

/** Whether `node` is (inside) the condition of an `if`, a guard not a choice. */
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

export default {
  rules: {
    'platform-android-choice': {
      meta: { type: /** @type {const} */ ('problem'), schema: [] },
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
  },
}
