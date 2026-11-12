import type { Size } from '@/features/territories/lib/cardPhotoFit'

export type PhotoView = { x: number; y: number; scale: number; angle: number }

export type Point = { x: number; y: number }

export const START_VIEW: PhotoView = { x: 0, y: 0, scale: 1, angle: 0 }

const QUARTER = Math.PI / 2
const NEAR = 0.01

export function aroundPoint(
  view: PhotoView,
  focal: Point,
  grow: number,
  turn: number
): PhotoView {
  'worklet'
  const dx = view.x - focal.x
  const dy = view.y - focal.y
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  return {
    x: focal.x + grow * (dx * cos - dy * sin),
    y: focal.y + grow * (dx * sin + dy * cos),
    scale: view.scale * grow,
    angle: view.angle + turn,
  }
}

export function turnedBounds(size: Size, angle: number): Size {
  'worklet'
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  return {
    width: size.width * cos + size.height * sin,
    height: size.width * sin + size.height * cos,
  }
}

export function fitScale(photo: Size, room: Size, angle: number): number {
  'worklet'
  const bounds = turnedBounds(photo, angle)
  if (bounds.width <= 0 || bounds.height <= 0) return 1
  return Math.min(room.width / bounds.width, room.height / bounds.height)
}

export function nextQuarterTurn(angle: number): number {
  'worklet'
  return (Math.floor(angle / QUARTER + NEAR) + 1) * QUARTER
}

export function normalizeAngle(angle: number): number {
  'worklet'
  const full = 2 * Math.PI
  return angle - Math.round(angle / full) * full
}

export function keepInRoom(
  view: PhotoView,
  photo: Size,
  room: Size
): PhotoView {
  'worklet'
  const bounds = turnedBounds(photo, view.angle)
  const limitX = Math.abs(bounds.width * view.scale - room.width) / 2
  const limitY = Math.abs(bounds.height * view.scale - room.height) / 2
  return {
    ...view,
    x: Math.min(limitX, Math.max(-limitX, view.x)),
    y: Math.min(limitY, Math.max(-limitY, view.y)),
  }
}

export function isStartView(view: PhotoView): boolean {
  'worklet'
  return (
    Math.abs(view.scale - 1) < 0.05 &&
    Math.abs(normalizeAngle(view.angle)) < NEAR &&
    Math.abs(view.x) < 1 &&
    Math.abs(view.y) < 1
  )
}

let shownView: ((view: PhotoView) => void) | null = null

export const cardPhotoViewForDev = {
  attach(show: ((view: PhotoView) => void) | null) {
    shownView = show
  },
  show(view: PhotoView): boolean {
    shownView?.(view)
    return shownView !== null
  },
}
