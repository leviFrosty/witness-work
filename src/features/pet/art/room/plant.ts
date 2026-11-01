import {
  fillEllipse,
  fillRect,
  rgbPalette,
  type PixelBuffer,
} from '@/lib/pixelArt'

const C = rgbPalette({
  rim: '#a85e33',
  pot: '#c0703f',
  potShadow: '#8e4f2a',
  leafDark: '#4f8a3c',
  leaf: '#5f9b48',
  leafLight: '#6fae52',
})

export function drawPlant(buf: PixelBuffer): void {
  fillRect(buf, 160, 70, 178, 73, C.rim)
  fillRect(buf, 162, 73, 176, 88, C.pot)
  fillRect(buf, 162, 73, 176, 74, C.potShadow)
  fillEllipse(buf, 169, 60, 4, 7, C.leafDark)
  fillEllipse(buf, 163, 64, 4, 5, C.leaf)
  fillEllipse(buf, 175, 64, 4, 5, C.leaf)
  fillEllipse(buf, 169, 66, 5, 4, C.leafLight)
}
