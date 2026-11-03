Pod::Spec.new do |s|
  s.name           = 'JarvisNative'
  s.version        = '0.3.0'
  s.summary        = 'Ponte entre os App Intents do JARVIS AI e o app (Keychain + intents pendentes).'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'JARVIS AI'
  s.homepage       = 'https://github.com/digoncalves14-hue/sir-alfred-team-hub'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
