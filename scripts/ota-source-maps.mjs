import fs from 'node:fs'
import path from 'node:path'

export function prepareHermesMaps(buildDirectory, uploadDirectory, platform) {
  const name = `index.${platform}.bundle`
  const input = path.join(buildDirectory, name)
  const map = JSON.parse(fs.readFileSync(`${input}.hbc.map`, 'utf8'))
  if (!map.x_hermes_function_offsets)
    throw new Error('Missing composed Hermes source map')

  map.debugId = JSON.parse(fs.readFileSync(`${input}.map`, 'utf8')).debugId
  if (!map.debugId) throw new Error('Missing Expo source map debug ID')
  fs.mkdirSync(uploadDirectory, { recursive: true })
  fs.copyFileSync(`${input}.hbc`, path.join(uploadDirectory, name))
  fs.writeFileSync(
    path.join(uploadDirectory, `${name}.map`),
    JSON.stringify(map)
  )
}
