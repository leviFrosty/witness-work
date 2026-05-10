import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { execSync, spawn, type ChildProcess } from 'child_process'
config()

interface LocaleMap {
  [key: string]: string | undefined
}

const LOCALE_DIR = 'src/locales'
// 60s between locales lets Azure F0's 33,300-char/min sliding window recover
// before the next locale starts, so back-to-back locales don't compound.
const REQUEST_DELAY_MS = 60_000
const FILE_TYPE = '.json'
const DEFAULT_SOURCE = 'en-US'

// Azure F0 enforces a 33,300 char/min sliding window. At 100 strings/request and
// ~70 chars/string, each request is ~7K chars; pacing one request every 13s caps
// throughput at ~32K chars/min — just under the F0 ceiling. Going higher trips 429s.
const MAX_LINES_PER_REQUEST = 100
const PER_REQUEST_DELAY_MS = 13_000

// Retry config — i18n-auto-translation always exits 0 even on Azure 429s,
// so we detect failures by scanning output and retry with exponential backoff.
// Backoffs need to exceed the 60s sliding-window for the throttle to clear.
const MAX_ATTEMPTS = 4
const INITIAL_BACKOFF_MS = 60_000
const BACKOFF_MULTIPLIER = 2
const BACKOFF_JITTER_MS = 5_000
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * Key: i18n locale code. Value: Azure Translator language code (undefined =
 * unsupported).
 */
const LOCALE_MAP: LocaleMap = {
  'en-US': 'en',
  'es-ES': 'es', // Azure has no separate es-MX/es-419 — only `es`
  'bem-ZM': undefined, // unsupported by Azure
  'de-DE': 'de',
  'fr-FR': 'fr',
  'it-IT': 'it',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'nl-NL': 'nl',
  'pt-BR': 'pt', // Azure's `pt` defaults to pt-br
  'pt-PT': 'pt-pt',
  'ru-RU': 'ru',
  'rw-RW': 'rw',
  'sw-KE': 'sw',
  'uk-UA': 'uk',
  'vi-VN': 'vi',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
}

const supportedLocales = (): string[] =>
  Object.keys(LOCALE_MAP).filter((k) => LOCALE_MAP[k])

interface CliArgs {
  help: boolean
  verbose: boolean
  force: boolean
  source: string
  destination?: string
}

const log = (...stringArrays: unknown[]): void => {
  console.log('[translate] - 🈂️ ' + stringArrays.join(' '))
}

const logError = (...stringArrays: unknown[]): void => {
  console.error('[translate] - ❌ ' + stringArrays.join(' '))
}

const logFailure = (locale: string, error: Error | string): void => {
  console.error(
    '[translate] - ❌ Failed to translate:',
    locale,
    '- Error:',
    typeof error === 'object' ? error.message : error
  )
}

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const startSpinner = (
  message: string
): { stop: (finalLine?: string) => void } => {
  let frame = 0
  const isTTY = process.stdout.isTTY
  const start = Date.now()

  const render = () => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const text = `[translate] - ${SPINNER_FRAMES[frame]} ${message} (${elapsed}s)`
    if (isTTY) {
      process.stdout.write(`\r\x1b[2K${text}`)
    }
  }

  if (isTTY) {
    render()
  } else {
    console.log(`[translate] - ⏳ ${message}...`)
  }

  const interval = setInterval(() => {
    frame = (frame + 1) % SPINNER_FRAMES.length
    render()
  }, 80)

  return {
    stop: (finalLine?: string) => {
      clearInterval(interval)
      if (isTTY) {
        process.stdout.write('\r\x1b[2K')
      }
      if (finalLine) {
        console.log(finalLine)
      }
    },
  }
}

const printHelp = (): void => {
  console.log(`
Usage: pnpm translate [options]

Translates the source locale into all destination locales using Azure Translator
(F0 free tier safe), filling in any missing keys (diff against existing translation).

Options:
  -s, --source <locale>        Source locale (default: ${DEFAULT_SOURCE})
  -d, --destination <locale>   Translate only this destination locale
                               (default: every supported locale)
  --force                      Skip the staged-files git check
  -v, --verbose                Stream underlying i18n-auto-translation output (default)
  -q, --quiet                  Suppress underlying tool output and show a spinner instead
  -h, --help                   Show this help and exit

Pacing (tuned for Azure F0's 33,300 char/min sliding window):
  - ${MAX_LINES_PER_REQUEST} strings per request
  - ${PER_REQUEST_DELAY_MS / 1000}s between requests within a locale
  - ${REQUEST_DELAY_MS / 1000}s between locales

Retry behavior:
  Each locale is retried up to ${MAX_ATTEMPTS} times with exponential backoff
  (${INITIAL_BACKOFF_MS / 1000}s × ${BACKOFF_MULTIPLIER}^n) on Azure 429s and other failures.
  After ${MAX_CONSECUTIVE_FAILURES} consecutive locale failures the run aborts early.

Supported locales (i18n codes):
  ${supportedLocales().join(', ')}
`)
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    help: false,
    verbose: true,
    force: false,
    source: DEFAULT_SOURCE,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '-h':
      case '--help':
        args.help = true
        break
      case '-v':
      case '--verbose':
        args.verbose = true
        break
      case '-q':
      case '--quiet':
        args.verbose = false
        break
      case '--force':
        args.force = true
        break
      case '-s':
      case '--source': {
        const value = argv[++i]
        if (!value) {
          logError(`${arg} requires a value`)
          process.exit(1)
        }
        args.source = value
        break
      }
      case '-d':
      case '--destination': {
        const value = argv[++i]
        if (!value) {
          logError(`${arg} requires a value`)
          process.exit(1)
        }
        args.destination = value
        break
      }
      default:
        logError(`Unknown argument: ${arg}`)
        printHelp()
        process.exit(1)
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  printHelp()
  process.exit(0)
}

const sourceAzure = LOCALE_MAP[args.source]
if (!sourceAzure) {
  logError(
    `Source locale "${args.source}" is not supported by Azure. Supported: ${supportedLocales().join(', ')}`
  )
  process.exit(1)
}

if (args.destination) {
  const destAzure = LOCALE_MAP[args.destination]
  if (!destAzure) {
    logError(
      `Destination locale "${args.destination}" is not supported by Azure. Supported: ${supportedLocales().join(', ')}`
    )
    process.exit(1)
  }
  if (args.destination === args.source) {
    logError(`Destination cannot match source (${args.source})`)
    process.exit(1)
  }
}

if (!args.force) {
  try {
    execSync(`git diff --cached --name-only | grep -e 'src/locales*'`, {
      encoding: 'utf8',
    })
    log('Found changed files!')
  } catch (error: unknown) {
    logError('Error detecting to detect changes: ', error)
    process.exit(0)
  }
} else {
  log(
    '🚀 Force flag detected - skipping git check and running translations anyway'
  )
}

log('Starting auto translations...')
log(`Source: ${args.source} (Azure: ${sourceAzure})`)
if (args.destination) {
  log(
    `Destination: ${args.destination} (Azure: ${LOCALE_MAP[args.destination]})`
  )
} else {
  log('Destinations: every supported locale')
}
log(
  args.verbose
    ? 'Verbose mode (default) — streaming underlying tool output'
    : 'Quiet mode — underlying tool output suppressed'
)

const listFilesWithoutExtensions = (directoryPath: string): string[] => {
  try {
    const files = fs.readdirSync(directoryPath)
    const fileNamesWithoutExtensions = files
      .filter((file) => fs.statSync(path.join(directoryPath, file)).isFile())
      .map((file) => path.parse(file).name)

    return fileNamesWithoutExtensions
  } catch (error) {
    logError('Error reading directory:', error)
    return []
  }
}

interface TranslationResult {
  locale: string
  success: boolean
  error?: Error
  rateLimited?: boolean
}

interface RenameOptions {
  revert?: boolean
}

function renameFilesForAzureSupport({ revert }: RenameOptions = {}): void {
  Object.keys(LOCALE_MAP).forEach((key) => {
    const azure = LOCALE_MAP[key]
    if (!azure) return
    let oldName = `${LOCALE_DIR}/${key}${FILE_TYPE}`
    let newName = `${LOCALE_DIR}/${azure}${FILE_TYPE}`
    if (revert) {
      const temp = oldName
      oldName = newName
      newName = temp
    }
    try {
      // Defensive: only rename when the source exists and the target doesn't.
      // Lets cleanup re-run idempotently after partial renames or crashes.
      if (fs.existsSync(oldName) && !fs.existsSync(newName)) {
        fs.renameSync(oldName, newName)
      }
    } catch (err) {
      logError(`Rename failed: ${oldName} -> ${newName}:`, err)
    }
  })
}

let renamed = false
let cleanedUp = false
let activeChild: ChildProcess | null = null

const cleanup = (): void => {
  if (cleanedUp) return
  cleanedUp = true
  if (activeChild && !activeChild.killed) {
    try {
      activeChild.kill('SIGTERM')
    } catch {
      // already dead
    }
    activeChild = null
  }
  if (renamed) {
    renameFilesForAzureSupport({ revert: true })
    renamed = false
  }
}

process.once('SIGINT', () => {
  console.log(
    '\n[translate] - ⚠️  Caught SIGINT — restoring locale filenames...'
  )
  cleanup()
  process.exit(130)
})
process.once('SIGTERM', () => {
  cleanup()
  process.exit(143)
})
process.once('exit', () => {
  cleanup()
})
process.once('uncaughtException', (err) => {
  logError('Uncaught exception:', err)
  cleanup()
  process.exit(1)
})

const FAILURE_PATTERNS = [
  /✖\s*Abort!/i,
  /Error for a file/i,
  /Status Code: 429/i,
  /Too Many Requests/i,
]
const RATE_LIMIT_PATTERN =
  /Status Code: 429|Too Many Requests|exceeded request limits/i

interface RunResult {
  ok: boolean
  error?: Error
  output: string
  rateLimited: boolean
}

const runTranslateOnce = (locale: string): Promise<RunResult> => {
  return new Promise((resolve) => {
    const apiKey = process.env.AZURE_TRANSLATOR_KEY
    const region = process.env.AZURE_TRANSLATOR_REGION
    if (!apiKey) {
      resolve({
        ok: false,
        error: new Error('AZURE_TRANSLATOR_KEY is not set'),
        output: '',
        rateLimited: false,
      })
      return
    }
    if (!region) {
      resolve({
        ok: false,
        error: new Error('AZURE_TRANSLATOR_REGION is not set'),
        output: '',
        rateLimited: false,
      })
      return
    }

    const cliArgs = [
      'i18n-auto-translation',
      '--apiProvider',
      'azure-official',
      '--key',
      apiKey,
      '--region',
      region,
      '--dirPath',
      `${LOCALE_DIR}/`,
      '--from',
      sourceAzure,
      '--to',
      locale,
      '--maxLinesPerRequest',
      String(MAX_LINES_PER_REQUEST),
      '--delay',
      String(PER_REQUEST_DELAY_MS),
    ]

    const child = spawn('pnpm', cliArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    activeChild = child

    let captured = ''
    const append = (chunk: Buffer, dest?: NodeJS.WriteStream) => {
      const text = chunk.toString('utf8')
      captured += text
      if (dest) dest.write(text)
    }

    child.stdout?.on('data', (chunk: Buffer) =>
      append(chunk, args.verbose ? process.stdout : undefined)
    )
    child.stderr?.on('data', (chunk: Buffer) =>
      append(chunk, args.verbose ? process.stderr : undefined)
    )

    child.on('error', (error) => {
      activeChild = null
      resolve({
        ok: false,
        error,
        output: captured,
        rateLimited: RATE_LIMIT_PATTERN.test(captured),
      })
    })

    child.on('close', (code, signal) => {
      activeChild = null
      const rateLimited = RATE_LIMIT_PATTERN.test(captured)
      const failureFromOutput = FAILURE_PATTERNS.some((p) => p.test(captured))

      if (signal) {
        resolve({
          ok: false,
          error: new Error(`killed by signal ${signal}`),
          output: captured,
          rateLimited,
        })
        return
      }
      // i18n-auto-translation swallows errors and exits 0 — output parsing is
      // the only reliable failure signal.
      if (code !== 0 || failureFromOutput) {
        const reason =
          code !== 0
            ? `exit ${code}`
            : rateLimited
              ? 'Azure 429 (rate limited)'
              : 'output indicated failure'
        resolve({
          ok: false,
          error: new Error(reason),
          output: captured,
          rateLimited,
        })
        return
      }
      resolve({ ok: true, output: captured, rateLimited: false })
    })
  })
}

const translateLocale = async (locale: string): Promise<TranslationResult> => {
  let spinner = args.verbose ? null : startSpinner(`Translating ${locale}`)
  if (args.verbose) {
    log(`Running i18n-auto-translation for ${locale}`)
  }

  let lastError: Error | undefined
  let lastOutput = ''
  let lastRateLimited = false

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const baseBackoff =
        INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 2)
      const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS)
      const delayMs = baseBackoff + jitter
      const seconds = (delayMs / 1000).toFixed(1)
      const reasonHint = lastRateLimited
        ? 'Azure 429 (rate limited)'
        : (lastError?.message ?? 'failure')
      spinner?.stop()
      log(
        `Retrying ${locale} after "${reasonHint}" — attempt ${attempt}/${MAX_ATTEMPTS} in ${seconds}s`
      )
      await sleep(delayMs)
      if (!args.verbose) {
        spinner = startSpinner(`Translating ${locale} (attempt ${attempt})`)
      }
    }

    const result = await runTranslateOnce(locale)
    if (result.ok) {
      spinner?.stop(`[translate] - ✅ Successfully translated: ${locale}`)
      return { locale, success: true }
    }
    lastError = result.error
    lastOutput = result.output
    lastRateLimited = result.rateLimited
  }

  spinner?.stop()
  logFailure(locale, lastError ?? new Error('Unknown failure'))
  if (!args.verbose && lastOutput) {
    console.error(lastOutput.trim())
  }

  return {
    locale,
    success: false,
    error: lastError ?? new Error('Unknown failure'),
    rateLimited: lastRateLimited,
  }
}

const processTranslationsSequentially = async (): Promise<
  TranslationResult[]
> => {
  const locales: string[] = listFilesWithoutExtensions(LOCALE_DIR)
  const results: TranslationResult[] = []
  let successCount = 0
  let failureCount = 0
  let consecutiveFailures = 0
  let aborted = false

  const targetAzure = args.destination
    ? LOCALE_MAP[args.destination]
    : undefined

  const isTranslatable = (l: string): boolean => {
    if (!Object.values(LOCALE_MAP).includes(l)) return false
    if (l === sourceAzure) return false
    if (targetAzure) return l === targetAzure
    return true
  }

  const translatable = locales.filter(isTranslatable)
  log(`Translating ${translatable.length} locale(s)...`)

  let processed = 0
  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i]

    if (!isTranslatable(locale)) continue

    processed++
    log(`(${processed}/${translatable.length}) Starting ${locale}`)

    const result = await translateLocale(locale)
    results.push(result)

    if (result.success) {
      successCount++
      consecutiveFailures = 0
    } else {
      failureCount++
      consecutiveFailures++
      if (result.rateLimited) {
        logError(
          `${locale} hit Azure 429 after ${MAX_ATTEMPTS} attempts — F0's 33,300 char/min sliding window may be saturated, or the 2M chars/hour quota is exhausted.`
        )
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logError(
          `${MAX_CONSECUTIVE_FAILURES} consecutive locale failures — aborting remaining locales.`
        )
        aborted = true
        break
      }
    }

    if (i < locales.length - 1) {
      log(
        `Pausing ${REQUEST_DELAY_MS / 1000}s before next locale (lets Azure F0's sliding window recover)...`
      )
      await sleep(REQUEST_DELAY_MS)
    }
  }

  log(
    `Translation complete! ✅ ${successCount} successful, ❌ ${failureCount} failed${aborted ? ' (aborted early)' : ''}`
  )

  if (failureCount > 0) {
    logError('Failed locales:')
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        logError(`- ${r.locale}${r.rateLimited ? ' (rate limited)' : ''}`)
      })
  }

  return results
}

renamed = true
renameFilesForAzureSupport()
processTranslationsSequentially()
  .catch((error) => {
    logError('Unexpected error during translations:', error)
  })
  .finally(() => {
    cleanup()
  })
