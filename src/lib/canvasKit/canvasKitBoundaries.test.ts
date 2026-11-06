import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

/**
 * On the web, Skia's modules bind to CanvasKit as they load, and CanvasKit
 * downloads only when something draws with Skia (`loadCanvasKit.web.ts`). So
 * the web build must never load a Skia module except through
 * `canvasKitComponent` or `canvasKitScreen`, which wait for it: not at launch,
 * and not with a screen that opens without CanvasKit. This walks the web's
 * module graph from `src/index.js` the way Metro would, and fails on any other
 * way into `@shopify/react-native-skia` or `victory-native`.
 */

const SRC = path.resolve(__dirname, '../..')
const SKIA = /^(@shopify\/react-native-skia|victory-native)(\/|$)/
const GATES = new Set(['canvasKitComponent', 'canvasKitScreen'])
const EXTENSIONS = ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js']

/** Ways in that never run on the web, with why. */
const ALLOWED: Record<string, string> = {
  // The Pet widget's images: iOS only (`installWidgetSync`).
  'app/widgets/widgetSync.ts -> @/features/pet/render/skiaImage': 'iOS only',
  // The loader itself, once WebGL is there.
  'lib/canvasKit/loadCanvasKit.web.ts -> @shopify/react-native-skia/lib/module/web':
    'CanvasKit',
}

type Edge = {
  request: string
  /** `static` loads with the file; `lazy` when a screen first opens. */
  kind: 'static' | 'inline' | 'lazy' | 'gated'
}

function resolve(from: string, request: string): string | null {
  let base: string
  if (request.startsWith('@/')) base = path.join(SRC, request.slice(2))
  else if (request.startsWith('.'))
    base = path.resolve(path.dirname(from), request)
  else return null
  for (const candidate of [
    ...EXTENSIONS.map((extension) => base + extension),
    ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ])
    if (fs.existsSync(candidate)) return candidate
  return null
}

type Node = { type: string; [key: string]: unknown }
const isNode = (value: unknown): value is Node =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Node).type === 'string'

const literal = (node: unknown) =>
  isNode(node) && node.type === 'StringLiteral'
    ? (node.value as string)
    : undefined

const edgeCache = new Map<string, Edge[]>()

/** The modules `file` loads, and when. */
function edges(file: string): Edge[] {
  const cached = edgeCache.get(file)
  if (cached) return cached
  const ast = parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  })
  const found: Edge[] = []
  const walk = (node: unknown, inFunction: boolean, gated: boolean) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, inFunction, gated)
      return
    }
    if (!isNode(node)) return
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source
    ) {
      const specifiers = (node.specifiers as Node[] | undefined) ?? []
      const typeOnly =
        node.importKind === 'type' ||
        node.exportKind === 'type' ||
        (specifiers.length > 0 &&
          specifiers.every((specifier) => specifier.importKind === 'type'))
      const request = literal(node.source)
      if (!typeOnly && request) found.push({ request, kind: 'static' })
    }
    if (node.type === 'CallExpression') {
      const callee = node.callee as Node
      const [first] = node.arguments as Node[]
      const request = literal(first)
      if (callee.type === 'Identifier' && callee.name === 'require' && request)
        found.push({
          request,
          kind: gated ? 'gated' : inFunction ? 'inline' : 'static',
        })
      if (callee.type === 'Import' && request)
        found.push({ request, kind: gated ? 'gated' : 'lazy' })
      if (callee.type === 'Identifier' && GATES.has(callee.name as string)) {
        walk(first, true, true)
        walk((node.arguments as Node[]).slice(1), true, gated)
        return
      }
    }
    // `getComponent={() => require(…)}`: the web loads the screen on demand.
    if (
      (node.type === 'JSXAttribute' &&
        (node.name as Node).name === 'getComponent') ||
      (node.type === 'ObjectProperty' &&
        ((node.key as Node).name ?? (node.key as Node).value) ===
          'getComponent')
    ) {
      const value = (node.value as Node | null) ?? null
      const inner =
        value?.type === 'JSXExpressionContainer'
          ? (value.expression as Node)
          : value
      if (
        inner?.type === 'ArrowFunctionExpression' &&
        isNode(inner.body) &&
        inner.body.type === 'MemberExpression'
      ) {
        const call = inner.body.object as Node
        const request =
          call.type === 'CallExpression' &&
          (call.callee as Node).name === 'require'
            ? literal((call.arguments as Node[])[0])
            : undefined
        if (request) {
          found.push({ request, kind: gated ? 'gated' : 'lazy' })
          return
        }
      }
    }
    const opensFunction =
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration' ||
      node.type === 'ObjectMethod' ||
      node.type === 'ClassMethod'
    for (const [key, child] of Object.entries(node))
      if (key !== 'loc' && key !== 'leadingComments')
        walk(child, inFunction || opensFunction, gated)
  }
  walk(ast.program, false, false)
  edgeCache.set(file, found)
  return found
}

/** Every way into Skia from what the web loads without CanvasKit. */
function waysIntoSkia(): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const queue = [path.join(SRC, 'index.js')]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const relative = path.relative(SRC, file)
    for (const edge of edges(file)) {
      if (edge.kind === 'gated') continue
      if (SKIA.test(edge.request)) {
        const way = `${relative} -> ${edge.request}`
        if (!ALLOWED[way]) problems.push(way)
        continue
      }
      if (ALLOWED[`${relative} -> ${edge.request}`]) continue
      const target = resolve(file, edge.request)
      if (target && /\.(tsx?|js)$/.test(target)) queue.push(target)
    }
  }
  return problems
}

describe('the web reaches Skia only through its CanvasKit gates', () => {
  it('loads no Skia module at launch or with a screen that opens without CanvasKit', () => {
    expect(waysIntoSkia()).toEqual([])
  })
})
