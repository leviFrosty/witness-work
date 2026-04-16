require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'StopwatchBridge'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'Levi Wilkerson'
  s.homepage       = 'https://github.com/leviFrosty/witness-work'
  # Match host app deployment target. Live Activity / ActivityKit APIs are
  # guarded with `@available(iOS 16.1/16.2/17, *)` in the Swift sources —
  # raising this to 16.2 causes expo-modules-autolinking to silently skip the
  # pod on projects that target iOS 15.1.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Matches first-party Expo modules.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Shared Swift files (StopwatchAttributes/Store/Intents/ActivityController)
  # are canonical here and symlinked into `targets/widgets/Stopwatch/` so the
  # widget extension compiles the same sources. Same type name on both sides
  # is what ActivityKit requires for the host app + extension to recognise the
  # activity.
  s.source_files = '**/*.{h,m,swift}'
end
