import { SIZE } from './svg.mjs'

export const MARK_W = 650
export const MARK_H = 506
const FRAME_RADIUS = 61
const PANEL = { x: 55, y: 145, w: 540, h: 306, r: 26 }
const HEAD = { cx: PANEL.x + 179, cy: PANEL.y + 107, r: 72 }
const BODY = { cx: PANEL.x + 179, cy: PANEL.y + 305, rx: 127, ry: 97 }
const BAR = {
  w: 145,
  h: 50,
  cx: PANEL.x + 414,
  cys: [PANEL.y + 82, PANEL.y + 190],
}

export const placement = ({
  width = 660,
  cx = SIZE / 2,
  cy = SIZE / 2,
} = {}) => {
  const scale = width / MARK_W
  const x = cx - (MARK_W * scale) / 2
  const y = cy - (MARK_H * scale) / 2
  return { scale, x, y, transform: `translate(${x} ${y}) scale(${scale})` }
}

const glyphShapes = (fill, extra = '') => {
  const bars = BAR.cys
    .map(
      (cy) =>
        `<rect x="${BAR.cx - BAR.w / 2}" y="${cy - BAR.h / 2}" width="${BAR.w}" height="${BAR.h}" rx="${BAR.h / 2}" fill="${fill}" ${extra}/>`
    )
    .join('')
  return (
    `<circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${HEAD.r}" fill="${fill}" ${extra}/>` +
    `<ellipse cx="${BODY.cx}" cy="${BODY.cy}" rx="${BODY.rx}" ry="${BODY.ry}" fill="${fill}" ${extra}/>` +
    bars
  )
}

export const cardMark = (
  defs,
  id,
  {
    frame,
    panel,
    glyph,
    shadow,
    sheen = false,
    stroke,
    strokeWidth = 18,
    ...place
  }
) => {
  const { transform } = placement(place)
  const clip = id('clip')
  defs.push(
    `<clipPath id="${clip}"><rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.w}" height="${PANEL.h}" rx="${PANEL.r}"/></clipPath>`
  )

  if (stroke) {
    const s = `fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"`
    const half = strokeWidth / 2
    return (
      `<g transform="${transform}" ${shadow ? `filter="${shadow}"` : ''}>` +
      `<rect x="${half}" y="${half}" width="${MARK_W - strokeWidth}" height="${MARK_H - strokeWidth}" rx="${FRAME_RADIUS - half}" ${s}/>` +
      `<rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.w}" height="${PANEL.h}" rx="${PANEL.r}" ${s}/>` +
      `<g clip-path="url(#${clip})">${glyphShapes(glyph ?? 'none', s.replace('fill="none" ', ''))}</g>` +
      `</g>`
    )
  }

  const sheenFill = sheen
    ? (() => {
        const gid = id('sheen')
        defs.push(
          `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="#fff" stop-opacity="0.32"/>` +
            `<stop offset="0.45" stop-color="#fff" stop-opacity="0"/>` +
            `</linearGradient>`
        )
        return `<rect width="${MARK_W}" height="${MARK_H}" rx="${FRAME_RADIUS}" fill="url(#${gid})"/>`
      })()
    : ''

  return (
    `<g transform="${transform}" ${shadow ? `filter="${shadow}"` : ''}>` +
    `<rect width="${MARK_W}" height="${MARK_H}" rx="${FRAME_RADIUS}" fill="${frame}"/>` +
    sheenFill +
    `<rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.w}" height="${PANEL.h}" rx="${PANEL.r}" fill="${panel}"/>` +
    `<g clip-path="url(#${clip})">${glyphShapes(glyph)}</g>` +
    `</g>`
  )
}

export const personGlyph = ({
  fill,
  height = 420,
  cx = SIZE / 2,
  cy = SIZE / 2,
  extra = '',
}) => {
  const unit = height / (72 * 2 + 38 + 97)
  const headR = 72 * unit
  const domeRx = 127 * unit
  const domeRy = 97 * unit
  const top = cy - height / 2
  const headCy = top + headR
  const base = top + height
  return (
    `<circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${fill}" ${extra}/>` +
    `<path d="M ${cx - domeRx} ${base} A ${domeRx} ${domeRy} 0 0 1 ${cx + domeRx} ${base} Z" fill="${fill}" ${extra}/>`
  )
}
