export const SIZE = 1024

export const createIds = () => {
  let next = 0
  return (prefix) => `${prefix}${next++}`
}

export const svgDocument = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`

const stopsMarkup = (stops) =>
  stops
    .map(([offset, color, opacity = 1]) => {
      const opacityAttr = opacity === 1 ? '' : ` stop-opacity="${opacity}"`
      return `<stop offset="${offset}" stop-color="${color}"${opacityAttr}/>`
    })
    .join('')

export const linear = (defs, id, stops, [x1, y1, x2, y2] = [0, 0, 0, 1]) => {
  const gid = id('lg')
  defs.push(
    `<linearGradient id="${gid}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsMarkup(stops)}</linearGradient>`
  )
  return `url(#${gid})`
}

export const radial = (defs, id, stops, { cx, cy, r, fx = cx, fy = cy }) => {
  const gid = id('rg')
  defs.push(
    `<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${stopsMarkup(stops)}</radialGradient>`
  )
  return `url(#${gid})`
}

export const dropShadow = (
  defs,
  id,
  { dy = 18, blur = 28, color = '#000', opacity = 0.28 } = {}
) => {
  const fid = id('sh')
  defs.push(
    `<filter id="${fid}" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur / 2}"/>` +
      `<feOffset dy="${dy}" result="b"/>` +
      `<feFlood flood-color="${color}" flood-opacity="${opacity}"/>` +
      `<feComposite in2="b" operator="in" result="s"/>` +
      `<feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge>` +
      `</filter>`
  )
  return `url(#${fid})`
}

export const glow = (defs, id, { blur = 18 } = {}) => {
  const fid = id('gl')
  defs.push(
    `<filter id="${fid}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="wide"/>` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur / 3}" result="tight"/>` +
      `<feMerge><feMergeNode in="wide"/><feMergeNode in="wide"/><feMergeNode in="tight"/><feMergeNode in="SourceGraphic"/></feMerge>` +
      `</filter>`
  )
  return `url(#${fid})`
}

export const blur = (defs, id, amount) => {
  const fid = id('bl')
  defs.push(
    `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${amount}"/></filter>`
  )
  return `url(#${fid})`
}

export const rect = (fill, extra = '') =>
  `<rect width="${SIZE}" height="${SIZE}" fill="${fill}" ${extra}/>`

export const random = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const ridge = (points, bottom = SIZE + 10) => {
  const [first, ...rest] = points
  let d = `M -10 ${bottom} L ${first[0]} ${first[1]}`
  for (let i = 0; i < rest.length; i++) {
    const prev = i === 0 ? first : rest[i - 1]
    const curr = rest[i]
    const mx = (prev[0] + curr[0]) / 2
    d += ` C ${mx} ${prev[1]} ${mx} ${curr[1]} ${curr[0]} ${curr[1]}`
  }
  return `${d} L ${SIZE + 10} ${bottom} Z`
}

export const fmt = (n) => Math.round(n * 10) / 10
