/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs')
const path = require('path')
require('dotenv').config()
const { execSync, exec } = require('child_process')

const log = (...stringArrays) => {
  console.log('[translate] - 🈂️ ' + stringArrays)
}
const logError = (...stringArrays) => {
  console.error('[translate] - ❌ ' + stringArrays)
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

const translationPromises = locales.map((locale) => {
  return new Promise((resolve, reject) => {
    const nodeCommand = `cd ${directoryPath} && i18n-auto-translation -k ${process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY} -d ./ -f en-US -t ${locale}`

    exec(nodeCommand, (error, stdout) => {
      if (error) {
        logError(`Error executing the command: ${error}`)
        reject(error)
      } else {
        log(stdout)
        resolve()
      }
    })
  })
})

Promise.all(translationPromises)
  .then(() => {
    log('Finished auto translations!')
  })
  .catch((error) => {
    logError('Error during translations:', error)
  })
