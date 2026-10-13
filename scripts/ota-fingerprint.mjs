import { generateFingerprints } from 'hot-updater'
import { writeFileSync } from 'node:fs'

const platform = process.argv[2]
if (!['ios', 'android', '--write'].includes(platform))
  throw new Error('Usage: ota-fingerprint.mjs <ios|android|--write>')
const fingerprints = await generateFingerprints()
if (platform === '--write')
  writeFileSync('fingerprint.json', JSON.stringify(fingerprints, null, 2))
else console.log(fingerprints[platform].hash)
