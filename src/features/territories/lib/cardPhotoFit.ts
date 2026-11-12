export type Size = { width: number; height: number }

export const fitInside = (room: Size, ratio: number): Size =>
  room.width / room.height > ratio
    ? { width: room.height * ratio, height: room.height }
    : { width: room.width, height: room.width / ratio }
