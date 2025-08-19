/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs')
const path = require('path')
require('dotenv').config()
const { execSync, exec } = require('child_process')

// Configurable delay between API requests (in milliseconds)
// Adjust this value to control the rate of requests to avoid hitting Google's rate limit
const REQUEST_DELAY_MS = 2000 // 2 seconds between requests

const log = (...stringArrays) => {
  console.log('[translate] - 🈂️ ' + stringArrays)
}
const logError = (...stringArrays) => {
  console.error('[translate] - ❌ ' + stringArrays)
}
const logSuccess = (locale) => {
  console.log('[translate] - ✅ Successfully translated:', locale)
}
const logFailure = (locale, error) => {
  console.error(
    '[translate] - ❌ Failed to translate:',
    locale,
    '- Error:',
    error.message || error
  )
}

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

log('Detecting if translations changed...')

try {
  execSync(`git diff --cached --name-only | grep -e 'src/locales*'`, {
    encoding: 'utf8',
  })
  log('Found changed files!')
} catch (error) {
  // Handle case when no match is found (grep returns non-zero exit code)
  if (error.status !== 0) {
    log('🆗 No translations changed, exiting...')
  } else {
    logError('Failed to detect changes: ', error)
  }
  return
}

log('Starting auto translations...')

const listFilesWithoutExtensions = (directoryPath) => {
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

const directoryPath = 'src/locales/'
const locales = listFilesWithoutExtensions(directoryPath)

const translateLocale = (locale) => {
  return new Promise((resolve, reject) => {
    const nodeCommand = `cd ${directoryPath} && i18n-auto-translation -k ${process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY} -d ./ -f en-US -t ${locale}`

    log(`Starting translation for: ${locale}`)

    exec(nodeCommand, (error, stdout) => {
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

const processTranslationsSequentially = async () => {
  const results = []
  let successCount = 0
  let failureCount = 0

  log(
    `Processing ${locales.length} locales with ${REQUEST_DELAY_MS}ms delay between requests...`
  )

  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i]

    try {
      await translateLocale(locale)
      successCount++
      results.push({ locale, success: true })
    } catch (result) {
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

  // Final summary
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

processTranslationsSequentially()
  .then(() => {
    log('Finished auto translations!')
  })
  .catch((error) => {
    logError('Unexpected error during translations:', error)
  })
