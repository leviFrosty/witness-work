import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { execSync, exec } from 'child_process'
config()

interface LocaleMap {
  [key: string]: string | undefined
}

const LOCALE_DIR = 'src/locales'
const REQUEST_DELAY_MS = 5
const FILE_TYPE = '.json'
/** Key: i18n expected translation. Value: deepl-free expected translation key */
const LOCALE_MAP: LocaleMap = {
  'en-US': 'EN',
  'es-MX': 'ES-419', // Spanish (Latin American)
  'es-ES': 'ES',
  'bem-ZM': undefined, // unsupported by deepl
  'de-DE': 'DE',
  'fr-FR': 'FR',
  'it-IT': 'IT',
  'ja-JP': 'JA',
  'ko-KR': 'KO',
  'nl-NL': 'NL',
  'pt-BR': 'PT-BR',
  'pt-PT': 'PT-PT',
  'ru-RU': 'RU',
  'rw-RW': undefined, // unsupported by deepl
  'sw-KE': undefined, // unsupported by deepl
  'uk-UA': 'UK',
  'vi-VN': 'VI',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

// Configurable delay between API requests

const log = (...stringArrays: unknown[]): void => {
  console.log('[translate] - 🈂️ ' + stringArrays.join(' '))
}

const logError = (...stringArrays: unknown[]): void => {
  console.error('[translate] - ❌ ' + stringArrays.join(' '))
}

const logSuccess = (locale: string): void => {
  console.log('[translate] - ✅ Successfully translated:', locale)
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

// Check for --force flag
const hasForceFlag: boolean = process.argv.includes('--force')
if (!hasForceFlag) {
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
}

const translateLocale = (locale: string): Promise<TranslationResult> => {
  return new Promise((resolve, reject) => {
    const nodeCommand = `pnpm i18n-auto-translation --key ${process.env.DEEPL_FREE_API_KEY} --apiProvider "deepl-free" --dirPath "${LOCALE_DIR}/" --from "EN" --to "${locale}"`

    console.log('FOUND FILES:', listFilesWithoutExtensions(LOCALE_DIR + '/'))

    exec(nodeCommand, (error, stdout, stderr) => {
      if (stderr) {
        logError(stderr)
      }
      if (error) {
        logFailure(locale, error)
        reject({ locale, error })
      } else {
        logSuccess(locale)
        if (stdout.trim()) {
          log(`Output for ${locale}:`, stdout.trim())
        }
        resolve({ locale, success: true })
      }
    })
  })
}

const processTranslationsSequentially = async (): Promise<
  TranslationResult[]
> => {
  const locales: string[] = listFilesWithoutExtensions(LOCALE_DIR)
  const results: TranslationResult[] = []
  let successCount = 0
  let failureCount = 0

  log(
    `Processing ${locales.length} locales with ${REQUEST_DELAY_MS}ms delay between requests...`
  )

  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i]

    if (!Object.values(LOCALE_MAP).includes(locale)) {
      log(`Skipping ${locale}, locale_map does not contain a valid target.`)
      continue
    }

    log(`Starting translation for: ${locale}`)
    try {
      const result = await translateLocale(locale)
      successCount++
      results.push(result)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (result: any) {
      failureCount++
      results.push({
        locale: result.locale,
        success: false,
        error: result.error,
      })
    }

    // Add delay between requests (except for the last one)
    if (i < locales.length - 1) {
      log(`Waiting ${REQUEST_DELAY_MS}ms before next request...`)
      await sleep(REQUEST_DELAY_MS)
    }
  }

  log(
    `Translation complete! ✅ ${successCount} successful, ❌ ${failureCount} failed`
  )

  if (failureCount > 0) {
    logError('Failed locales:')
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        logError(`- ${r.locale}`)
      })
  }

  return results
}

interface RenameOptions {
  revert?: boolean
}

function renameFilesForDeeplSupport({ revert }: RenameOptions = {}): void {
  log('Preparing file names for i18n-auto-translation...')
  Object.keys(LOCALE_MAP).forEach((key) => {
    let oldName = `${LOCALE_DIR}/${key}${FILE_TYPE}`
    let newName = `${LOCALE_DIR}/${LOCALE_MAP[key]}${FILE_TYPE}`
    if (revert) {
      const temp = oldName
      oldName = newName
      newName = temp
    }
    if (!LOCALE_MAP[key]) {
      log('Skipping rename for: ', key)
      return // we don't want to rename files that have no support by translation provider
    }
    log('Temporarily renaming: ', oldName, ' to: ', newName)
    fs.renameSync(oldName, newName)
  })
}

log('Detecting if translations changed...')

renameFilesForDeeplSupport()
processTranslationsSequentially()
  .then(() => {
    log('Finished auto translations!')
  })
  .catch((error) => {
    logError('Unexpected error during translations:', error)
  })
  .finally(() => {
    log('Finally reverting file names back...')
    renameFilesForDeeplSupport({ revert: true })
  })
