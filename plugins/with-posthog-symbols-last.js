const { withPodfile } = require('@expo/config-plugins')

const MARKER = '# with-posthog-symbols-last'

module.exports = function withPostHogSymbolsLast(config) {
  return withPodfile(config, (config) => {
    if (config.modResults.contents.includes(MARKER)) return config

    // apple-targets adds widget embedding after PostHog finalizes xcodeproj.
    // Waiting for the dSYM before embedding creates an archive dependency cycle.
    // post_integrate runs after both target generation and CocoaPods integration.
    config.modResults.contents += `
${MARKER}
post_integrate do |installer|
  installer.aggregate_targets.map(&:user_project).uniq.each do |project|
    project.native_targets.each do |target|
      phase = target.shell_script_build_phases.find { |item| item.name == 'Upload PostHog Debug Symbols' }
      next unless phase

      target.build_phases.delete(phase)
      target.build_phases << phase
    end
    project.save
  end
end
`
    return config
  })
}
