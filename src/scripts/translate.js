/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs')
const path = require('path')
require('dotenv').config()
const { exec } = require('child_process')

const log = (...stringArrays) => {
  console.log('[translate] - ' + stringArrays)
}
const logError = (...stringArrays) => {
  console.error('[translate] - ' + stringArrays)
}

log('✅ Starting auto translations...')

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
    const nodeCommand = `cd ${directoryPath} && i18n-auto-translation -k ${process.env.GOOGLE_CLOUD_API_KEY} -d ./ -f en -t ${locale}`

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
    log('✅ Finished auto translations')
  })
  .catch((error) => {
    logError('Error during translations:', error)
  })
