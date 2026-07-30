require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AmporaIgnition'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'UNLICENSED'
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { ios: '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  # FamilyControls / ManagedSettings / DeviceActivity are Apple SYSTEM
  # frameworks (iOS 16+), not CocoaPods -- nothing to `s.dependency` for them,
  # just link + import. ExpoModulesCore is the one real pod dependency.
  s.dependency 'ExpoModulesCore'

  # Only the MAIN MODULE's sources. The three app-extension targets
  # (DeviceActivityMonitor / ShieldConfiguration / ShieldAction) are plain
  # Xcode targets registered directly against the .xcodeproj by
  # `../plugin/withExtensionTargets.js` at `expo prebuild` time -- they are
  # NOT part of this pod, and Info.plist / entitlements below them are copied
  # in by the same plugin, not by CocoaPods. `AppGroupStore.swift` is shared:
  # this podspec compiles it once into the AmporaIgnition pod for the main
  # app target, and the plugin separately copies the SAME source file into
  # each extension's folder so their (non-pod) Sources build phase can
  # compile it too. One canonical file on disk, two compiled copies in the
  # build -- see native/README.md.
  s.source_files = 'AmporaIgnitionModule.swift', 'AppGroupStore.swift'
end
