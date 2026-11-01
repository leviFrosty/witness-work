import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { transformSync, type NodePath, type types as t } from '@babel/core'

const require = createRequire(import.meta.url)
const fromPreset = createRequire(require.resolve('babel-preset-expo'))
const typescript = fromPreset('@babel/plugin-transform-typescript')
const jsx = fromPreset('@babel/plugin-syntax-jsx')
const reactCompiler = require('babel-plugin-react-compiler')

const readsClock = (node: t.CallExpression | t.NewExpression) => {
  const { callee } = node
  if (node.type === 'NewExpression')
    return (
      callee.type === 'Identifier' &&
      callee.name === 'Date' &&
      node.arguments.length === 0
    )
  if (callee.type === 'Identifier')
    return callee.name === 'moment' && node.arguments.length === 0
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Date' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'now'
  )
}

const readsMemoCache = (node: unknown): boolean => {
  if (!node || typeof node !== 'object') return false
  const n = node as { type?: string; object?: { type?: string; name?: string } }
  if (
    n.type === 'MemberExpression' &&
    n.object?.type === 'Identifier' &&
    n.object.name === '$'
  )
    return true
  return Object.entries(node).some(
    ([key, value]) => key !== 'loc' && readsMemoCache(value)
  )
}

export function cachedClockReads(file: string) {
  const filename = path.resolve(__dirname, '../../..', file)
  const compiled = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      [typescript, { isTSX: true }],
      jsx,
      [reactCompiler, { target: '19', panicThreshold: 'none' }],
    ],
  })?.code
  const found: string[] = []
  const check = (path: NodePath<t.CallExpression | t.NewExpression>) => {
    if (!readsClock(path.node)) return
    for (let p: NodePath | null = path; p; p = p.parentPath) {
      const parent = p.parentPath

      if (p.isFunction())
        return parent?.isCallExpression() &&
          parent.get('callee').isIdentifier({ name: 'useMemo' })
          ? void found.push(path.getSource())
          : undefined
      if (
        parent?.isIfStatement() &&
        p.key === 'consequent' &&
        readsMemoCache(parent.node.test)
      ) {
        found.push(path.getSource())
        return
      }
    }
  }
  transformSync(compiled ?? '', {
    babelrc: false,
    configFile: false,
    code: false,
    plugins: [
      jsx,
      () => ({ visitor: { CallExpression: check, NewExpression: check } }),
    ],
  })
  return found
}
