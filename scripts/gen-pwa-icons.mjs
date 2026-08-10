// Generates pwa-192x192.png and pwa-512x512.png from the brand colour.
// Pure Node.js — no external dependencies. Run once: node scripts/gen-pwa-icons.mjs
import { writeFileSync } from 'fs'
import { deflateSync } from 'zlib'

// Brand colour #863bff = rgb(134, 59, 255)
const [R, G, B] = [134, 59, 255]

function encodePNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // colour type: RGB
  ihdrData[10] = 0 // compression: deflate
  ihdrData[11] = 0 // filter: adaptive
  ihdrData[12] = 0 // interlace: none

  const row = Buffer.allocUnsafe(1 + size * 3)
  row[0] = 0 // filter type: none
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = R
    row[2 + x * 3] = G
    row[3 + x * 3] = B
  }
  const raw = Buffer.alloc(size * row.length)
  for (let y = 0; y < size; y++) row.copy(raw, y * row.length)
  const idatData = deflateSync(raw, { level: 9 })

  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[i] = c
  }
  function crc32(buf) {
    let crc = 0xffffffff
    for (const b of buf) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff]
    return (crc ^ 0xffffffff) >>> 0
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii')
    const len = Buffer.allocUnsafe(4)
    len.writeUInt32BE(data.length)
    const crcBuf = Buffer.allocUnsafe(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/pwa-192x192.png', encodePNG(192))
writeFileSync('public/pwa-512x512.png', encodePNG(512))
console.log('PWA icons written: public/pwa-192x192.png, public/pwa-512x512.png')
