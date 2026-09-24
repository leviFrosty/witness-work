require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'CalendarBridge'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = 'MIT'
  s.author = 'Levi Wilkerson'
  s.homepage = 'https://github.com/leviFrosty/witness-work'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CloudKit', 'EventKit', 'Security'
  s.source_files = '**/*.{h,m,swift}'
end
