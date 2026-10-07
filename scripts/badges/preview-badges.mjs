#!/usr/bin/env node
/**
 * Renders every badge medallion into a self-contained HTML gallery so the art
 * can be reviewed without a simulator. Uses the same emblem, palette and
 * medallion modules as `src/components/badges/BadgeMedallion.tsx`.
 *
 * Usage: `node scripts/badges/preview-badges.mjs [outfile]` (default
 * `.verify/badges-preview.html`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The art modules are TypeScript loaded through Node's type stripping. The
// repo's package.json has no "type", so Node warns that it re-parsed them as
// ESM; that warning is expected here, so hide just that one.
const emitWarning = process.emitWarning.bind(process)
process.emitWarning = (warning, ...rest) => {
  const text = typeof warning === 'string' ? warning : warning?.message
  if (/Module type of .* is not specified/.test(text ?? '')) return
  emitWarning(warning, ...rest)
}

const art = '../../src/components/badges/art'
const { BADGE_EMBLEMS } = await import(`${art}/emblems.ts`)
const { badgePalette } = await import(`${art}/palette.ts`)
const {
  EMBLEM_TRANSFORM,
  MEDALLION,
  MEDALLION_VIEWBOX,
  emblemStrokeScale,
  medallionScene,
  resolveEmblem,
} = await import(`${art}/medallion.ts`)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outfile = resolve(root, process.argv[2] ?? '.verify/badges-preview.html')

const COLLECTIONS = [
  ['monthsShared', 'Sharing the Good News'],
  ['yearRound', 'Year Round'],
  ['reportSent', 'Reports Sent'],
  ['prepared', 'Ready to Go'],
  ['conversations', 'Kind Words'],
  ['returnVisits', 'Return Visits'],
  ['nextTime', 'Next Time'],
  ['keepingInTouch', 'Keeping in Touch'],
  ['together', 'Two by Two'],
]
const ONE_TIME = [
  ['firstBibleStudy', 'First Bible Study'],
  ['firstBuddy', 'First Buddy'],
]
const LEVEL_NAMES = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Pearl' }

const SCHEMES = {
  light: {
    page: '#E9E9E9',
    card: '#FFFFFF',
    text: '#373737',
    textAlt: '#9B9B9B',
  },
  dark: {
    page: '#121212',
    card: '#1C1C1E',
    text: '#E2E2E2',
    textAlt: '#7D7D7D',
  },
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ')

const gradient = (g) => {
  const stops = g.stops
    .map(
      (s) =>
        `<stop ${attrs({ offset: s.offset, 'stop-color': s.color, 'stop-opacity': s.opacity })}/>`
    )
    .join('')
  if (g.kind === 'linear') {
    return `<linearGradient ${attrs({ id: g.id, gradientUnits: 'userSpaceOnUse', x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 })}>${stops}</linearGradient>`
  }
  return `<radialGradient ${attrs({ id: g.id, gradientUnits: 'userSpaceOnUse', cx: g.cx, cy: g.cy, r: g.r, fx: g.fx, fy: g.fy })}>${stops}</radialGradient>`
}

const sceneCircle = (c) =>
  `<circle ${attrs({
    cx: c.cx,
    cy: c.cy,
    r: c.r,
    fill: c.fill,
    stroke: c.stroke,
    'stroke-width': c.strokeWidth,
    'stroke-dasharray': c.strokeDasharray,
  })}/>`

const emblemPart = (p) => {
  const common = {
    fill: p.fill,
    stroke: p.stroke,
    'stroke-width': p.stroke === 'none' ? undefined : p.strokeWidth,
    opacity: p.opacity,
  }
  if (p.type === 'circle')
    return `<circle ${attrs({ cx: p.cx, cy: p.cy, r: p.r, ...common })}/>`
  return `<path ${attrs({ d: p.d, ...common })}/>`
}

let counter = 0

/** Mirrors BadgeMedallion.tsx. */
const medallion = ({ art, level, size, scheme, state = 'earned' }) => {
  const id = `b${counter++}`
  const palette = badgePalette(level, scheme, state)
  const pips = level !== null && size >= MEDALLION.pipMinSize ? level : 0
  const scene = medallionScene(palette, id, pips)
  const parts = resolveEmblem(
    BADGE_EMBLEMS[art],
    palette,
    emblemStrokeScale(size)
  )
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${MEDALLION_VIEWBOX} ${MEDALLION_VIEWBOX}" aria-hidden="true"><defs>${scene.gradients.map(gradient).join('')}</defs>${scene.back.map(sceneCircle).join('')}<g transform="${EMBLEM_TRANSFORM}" opacity="${palette.emblemOpacity}" stroke-linecap="round" stroke-linejoin="round">${parts.map(emblemPart).join('')}</g>${scene.front.map(sceneCircle).join('')}</svg>`
}

const variants = (oneTime) =>
  oneTime
    ? [
        { level: null, state: 'earned', label: 'One-time' },
        { level: null, state: 'locked', label: 'Locked' },
      ]
    : [
        ...[1, 2, 3, 4].map((level) => ({
          level,
          state: 'earned',
          label: LEVEL_NAMES[level],
        })),
        { level: 2, state: 'locked', label: 'Locked (L2)' },
      ]

const artRow = (art, name, oneTime, scheme) => {
  const cells = variants(oneTime)
    .map(
      (v) => `<div class="cell">
  ${medallion({ art, level: v.level, size: 180, scheme, state: v.state })}
  <div class="small">
    ${medallion({ art, level: v.level, size: 64, scheme, state: v.state })}
    ${medallion({ art, level: v.level, size: 28, scheme, state: v.state })}
  </div>
  <div class="label">${esc(v.label)}</div>
</div>`
    )
    .join('')
  return `<section class="row" id="${scheme}-${art}"><h3>${esc(name)} <code>${art}</code></h3><div class="cells">${cells}</div></section>`
}

const strip = (scheme, size) => {
  const all = [...COLLECTIONS, ...ONE_TIME]
  const rows = [1, 2, 3, 4, null]
    .map(
      (level) =>
        `<div class="strip-row">${all
          .map(([art]) => {
            const isOneTime = ONE_TIME.some(([a]) => a === art)
            if (isOneTime && level !== null)
              return medallion({ art, level: null, size, scheme })
            if (!isOneTime && level === null)
              return medallion({ art, level: 1, size, scheme, state: 'locked' })
            return medallion({ art, level, size, scheme })
          })
          .join('')}</div>`
    )
    .join('')
  return `<section class="strip" id="${scheme}-strip-${size}"><h3>All badges at ${size} px</h3>${rows}</section>`
}

const card = (scheme) => {
  const c = SCHEMES[scheme]
  const rows = [
    ...COLLECTIONS.map(([art, name]) => artRow(art, name, false, scheme)),
    ...ONE_TIME.map(([art, name]) => artRow(art, name, true, scheme)),
  ].join('')
  return `<div class="card ${scheme}" style="background:${c.card};color:${c.text};--alt:${c.textAlt}">
  <h2>${scheme === 'light' ? 'Light' : 'Dark'}</h2>
  ${strip(scheme, 24)}
  ${strip(scheme, 28)}
  ${strip(scheme, 44)}
  ${rows}
</div>`
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>WitnessWork badges</title>
<style>
  body { margin: 0; padding: 24px; font: 14px/1.4 -apple-system, BlinkMacSystemFont, Inter, sans-serif; background: linear-gradient(90deg, ${SCHEMES.light.page} 50%, ${SCHEMES.dark.page} 50%); }
  .wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .card { border-radius: 20px; padding: 20px 24px; }
  h2 { margin: 0 0 12px; font-size: 18px; }
  h3 { margin: 18px 0 10px; font-size: 13px; font-weight: 600; }
  h3 code { color: var(--alt); font-weight: 400; margin-left: 6px; }
  .cells { display: flex; gap: 14px; flex-wrap: wrap; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .small { display: flex; align-items: center; gap: 10px; }
  .label { font-size: 11px; color: var(--alt); }
  .strip-row { display: flex; gap: 8px; margin-bottom: 8px; }
  .row, .strip { width: fit-content; }
  svg { display: block; }
</style></head>
<body><div class="wrap">${card('light')}${card('dark')}</div></body></html>
`

mkdirSync(dirname(outfile), { recursive: true })
writeFileSync(outfile, html)
console.log(`Wrote ${outfile}`)
