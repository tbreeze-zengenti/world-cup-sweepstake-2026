#!/usr/bin/env node
/**
 * Generates data/icons/icon-192.png and icon-512.png — the PWA manifest /
 * notification icons. Pure Node (zlib + hand-rolled PNG encoding) so no
 * native image tooling is needed. Design: a white football with black
 * pentagon and seams on the site's deep-navy background, rounded corners.
 *
 * Usage: node scripts/build-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'icons')

// --- palette (matches styles.css dark theme) ---
const NAVY = [0x0b, 0x1f, 0x3a]
const GLOW = [0x16, 0x34, 0x5f]
const WHITE = [0xf2, 0xf6, 0xfb]
const BLACK = [0x10, 0x18, 0x24]

// --- tiny geometry helpers -------------------------------------------------
const pentagon = (cx, cy, r, rot = -Math.PI / 2) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / 5
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })

function inPolygon(px, py, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distToSegment(px, py, [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

// --- render one icon -------------------------------------------------------
function render(size) {
  const c = size / 2
  const corner = size * 0.18
  const ballR = size * 0.34
  const pentR = size * 0.13
  const seamW = size * 0.018
  const pent = pentagon(c, c, pentR)
  const seamEnds = pentagon(c, c, ballR * 0.97)

  const colorAt = (x, y) => {
    // rounded-rect background mask
    const ex = Math.max(0, Math.max(corner - x, x - (size - corner)))
    const ey = Math.max(0, Math.max(corner - y, y - (size - corner)))
    if (ex > 0 && ey > 0 && Math.hypot(ex, ey) > corner) return null

    const d = Math.hypot(x - c, y - c)
    if (d <= ballR) {
      if (inPolygon(x, y, pent)) return BLACK
      for (let i = 0; i < 5; i++) {
        if (distToSegment(x, y, pent[i], seamEnds[i]) < seamW) return BLACK
      }
      // ball edge ring
      if (d > ballR - seamW * 1.4) return BLACK
      return WHITE
    }
    // subtle radial glow toward the centre-top, like the page background
    const g = Math.max(0, 1 - Math.hypot(x - c, y - size * 0.1) / size)
    return NAVY.map((ch, i) => Math.round(ch + (GLOW[i] - ch) * g))
  }

  // 3x3 supersampling for smooth edges
  const SS = 3
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const col = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
          if (col) {
            r += col[0]
            g += col[1]
            b += col[2]
            a += 255
          }
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      px[o] = r / n
      px[o + 1] = g / n
      px[o + 2] = b / n
      px[o + 3] = a / n
    }
  }
  return px
}

// --- minimal PNG encoder ---------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, encodePng(render(size), size))
  console.log(`wrote ${file}`)
}
