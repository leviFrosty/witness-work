import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', async () => {
  const file = path.join(__dirname, 'webMenuIcons.ts')
  const names = fs
    .readFileSync(file, 'utf8')
    .match(/import \{([^}]+)\} from 'lucide-react-native'/)![1]!
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  return Object.fromEntries(names.map((name) => [name, name]))
})
vi.mock('@/components/ui/DirectionalIcon', () => ({ UndoIcon: 'UndoIcon' }))

import webMenuIcons from '@/components/ui/web/webMenuIcons'

const SRC = path.join(__dirname, '../../..')

const sourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(file)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [file]
      : []
  })

const NAMED =
  /systemImage[:=]\s*\{?\s*(?:[^'"\n,]*\?\s*)?'([^']+)'(?:\s*:\s*'([^']+)')?/g

const FROM_TABLES = ['house', 'building.2', 'hourglass', 'globe']

describe('webMenuIcons', () => {
  it('has an icon for every symbol the app gives a menu item', () => {
    const used = new Set(FROM_TABLES)
    for (const file of sourceFiles(SRC))
      for (const match of fs.readFileSync(file, 'utf8').matchAll(NAMED))
        for (const name of match.slice(1)) if (name) used.add(name)

    expect(used.size).toBeGreaterThan(50)
    expect([...used].filter((name) => !webMenuIcons[name]).sort()).toEqual([])
  })
})
