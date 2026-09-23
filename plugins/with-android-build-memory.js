const { withGradleProperties } = require('expo/config-plugins')

// A release compiles every ABI and runs native lint. Expo's 512 MB metaspace
// default exhausts the Gradle daemon before this app can finish packaging.
module.exports = (config) =>
  withGradleProperties(config, (config) => {
    const settings = {
      'org.gradle.jvmargs': '-Xmx3072m -XX:MaxMetaspaceSize=1536m',
      'org.gradle.workers.max': '2',
    }
    for (const [key, value] of Object.entries(settings)) {
      const existing = config.modResults.find(
        (entry) => entry.type === 'property' && entry.key === key
      )
      if (existing) existing.value = value
      else config.modResults.push({ type: 'property', key, value })
    }
    return config
  })
