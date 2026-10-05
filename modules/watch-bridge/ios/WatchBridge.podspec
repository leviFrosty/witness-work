require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'WatchBridge'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'Levi Wilkerson'
  s.homepage       = 'https://github.com/leviFrosty/witness-work'
  # Match host app deployment target (see StopwatchBridge.podspec).
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Timer commands from the watch run against the shared StopwatchStore.
  s.dependency 'StopwatchBridge'
  s.frameworks = 'WatchConnectivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # `WatchProtocol.swift` is canonical here and copied into the watch targets
  # by `scripts/sync-widget-shared.mjs`.
  s.source_files = '**/*.{h,m,swift}'
end
