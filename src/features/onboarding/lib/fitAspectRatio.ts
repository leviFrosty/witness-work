export interface Size {
  width: number
  height: number
}

export const fitAspectRatio = (box: Size, ratio: number): Size => {
  const width = Math.min(box.width, box.height * ratio)
  return { width, height: width / ratio }
}
