// pnpm help:image <slug> <screenshot.png> [--crop WxH+X+Y]
// Saves a Help Center screenshot as content/help/images/<slug>.webp (600 px
// wide at most) and prints the Markdown line to paste into the answer.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { HELP_IMAGES_DIR } from '../../src/lib/help-center/images.ts'

const args = process.argv.slice(2)
const cropIndex = args.indexOf('--crop')
const crop = cropIndex === -1 ? undefined : args.splice(cropIndex, 2)[1]
const [name, given] = args
// pnpm runs scripts from the package folder; resolve the path from where it was typed.
const input =
  given && path.resolve(process.env.INIT_CWD ?? process.cwd(), given)

const fail = (message: string): never => {
  console.error(`help:image: ${message}`)
  process.exit(1)
}

if (!name || !given)
  fail('usage: pnpm help:image <slug> <screenshot.png> [--crop WxH+X+Y]')
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name!))
  fail(`"${name}" isn't a slug; use the answer's file name, like submit-report`)
const answers = readdirSync('content/help/en-US', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((category) =>
    existsSync(path.join('content/help/en-US', category, `${name}.mdx`))
  )
if (answers.length === 0)
  fail(
    `no English answer is named ${name}.mdx; name the image after its answer`
  )
if (crop && !/^\d+x\d+\+\d+\+\d+$/.test(crop))
  fail(`--crop takes WxH+X+Y in the screenshot's pixels, like 1206x1400+0+300`)
if (!existsSync(input!)) fail(`${input} doesn't exist`)

const output = path.join(HELP_IMAGES_DIR, `${name}.webp`)
mkdirSync(HELP_IMAGES_DIR, { recursive: true })
try {
  execFileSync(
    'magick',
    [
      input!,
      ...(crop ? ['-crop', crop, '+repage'] : []),
      '-resize',
      '600x>',
      '-strip',
      '-quality',
      '80',
      '-define',
      'webp:method=6',
      output,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  fail(
    code === 'ENOENT'
      ? 'ImageMagick is missing; install it with `brew install imagemagick`'
      : `ImageMagick failed: ${String((error as { stderr?: Buffer }).stderr ?? error).trim()}`
  )
}

const kb = Math.round(statSync(output).size / 1024)
console.log(`Saved ${output} (${kb} KB). Put this on its own line in content/help/en-US/${answers[0]}/${name}.mdx, under the step it shows:

![Describe the screen in a few words](${name}.webp)`)
