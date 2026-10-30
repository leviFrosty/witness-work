#!/usr/bin/env node
// Writes the landing page's download QR code (public/images/get-qr.svg), which
// points at /get. Re-run only if the URL changes: printed copies of the code
// exist, so /get must keep working forever (docs/adr/0042-witnesswork-app-domain.md §5).
//
//   node scripts/landing/build-qr.mjs [url]
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'

const url = process.argv[2] ?? 'https://witnesswork.app/get'
const svg = await QRCode.toString(url, {
  type: 'svg',
  margin: 0,
  color: { dark: '#0b130e', light: '#ffffff' },
})
const file = path.resolve(import.meta.dirname, '../../public/images/get-qr.svg')
// The same prolog the original file had.
const prolog =
  '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
writeFileSync(file, prolog + svg)
console.log(`Wrote ${path.relative(process.cwd(), file)} for ${url}`)
