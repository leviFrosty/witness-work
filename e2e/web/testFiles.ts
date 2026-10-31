import zlib from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/**
 * A PNG of `width`×`height`: a colour gradient, or one flat colour for sizes
 * too large to hold in memory row by row. Written by hand so the specs need no
 * image library.
 */
export async function makePng(
  width: number,
  height: number,
  options: { flat?: boolean } = {}
): Promise<Buffer> {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const deflate = zlib.createDeflate({ level: 1 })
  const parts: Buffer[] = []
  deflate.on('data', (part: Buffer) => parts.push(part))
  const done = new Promise<void>((resolve) => deflate.on('end', resolve))
  const row = Buffer.alloc(1 + width * 3)
  for (let y = 0; y < height; y++) {
    if (!options.flat || y === 0)
      for (let x = 0; x < width; x++) {
        row[1 + x * 3] = options.flat ? 30 : Math.round((x / width) * 255)
        row[2 + x * 3] = options.flat ? 120 : Math.round((y / height) * 255)
        row[3 + x * 3] = options.flat ? 200 : 140
      }
    if (!deflate.write(row)) await new Promise((r) => deflate.once('drain', r))
  }
  deflate.end()
  await done
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', Buffer.concat(parts)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
