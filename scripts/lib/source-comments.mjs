import tseslint from 'typescript-eslint'

export const sourceExtensions = /\.(?:[cm]?[jt]s|[jt]sx)$/

export function parseSource(source, filename) {
  return tseslint.parser.parseForESLint(source, {
    filePath: filename,
    comment: true,
    tokens: true,
    range: true,
    loc: true,
    ecmaFeatures: { jsx: /\.(?:jsx|tsx|js|mjs|cjs)$/.test(filename) },
  }).ast
}

export function stripSourceComments(source, filename) {
  const original = parseSource(source, filename)
  if (!original.comments.length) return { source, count: 0 }
  let output = ''
  let offset = 0
  for (const comment of original.comments) {
    const [start, end] = comment.range
    output += source.slice(offset, start)
    output += source.slice(start, end).replace(/[^\r\n\u2028\u2029]/g, ' ')
    offset = end
  }
  output += source.slice(offset)
  const stripped = parseSource(output, filename)
  const fingerprint = (ast) =>
    JSON.stringify(ast, (key, value) => {
      if (['comments', 'tokens', 'loc', 'range'].includes(key)) return undefined
      return typeof value === 'bigint' ? String(value) : value
    })
  if (fingerprint(original) !== fingerprint(stripped))
    throw new Error(`Stripping comments changed the syntax tree: ${filename}`)
  return { source: output, count: original.comments.length }
}

export const noComments = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow comments in JavaScript and TypeScript source.',
    },
    schema: [],
    messages: { unexpected: 'Source comments are not allowed.' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') continue
          context.report({ loc: comment.loc, messageId: 'unexpected' })
        }
      },
    }
  },
}
