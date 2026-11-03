import ExpoModulesCore
import Foundation
import Security

/// Armazenamento compartilhado entre o app (JS) e os App Intents (código Swift no alvo do app).
/// Mesmo formato usado em JarvisAppIntents.swift (`JarvisIntentStore`).
enum JarvisBridgeStore {
  static let keychainService = "com.jarvisai.device"
  static let keychainAccount = "credentials"
  static let pendingKey = "jarvis.pendingIntent"
  static let intentNotification = Notification.Name("JarvisIntentReceived")

  static func saveCredentials(apiUrl: String, token: String) throws {
    let payload = try JSONSerialization.data(withJSONObject: ["apiUrl": apiUrl, "token": token])
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
    ]
    SecItemDelete(query as CFDictionary)
    var attributes = query
    attributes[kSecValueData as String] = payload
    // Disponível em segundo plano após o primeiro desbloqueio (Siri com o app fechado).
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(attributes as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw NSError(domain: "JarvisNative", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Falha ao salvar no Keychain (\(status))"])
    }
  }

  static func hasCredentials() -> Bool {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecReturnData as String: false,
    ]
    return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
  }

  static func clearCredentials() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
    ]
    SecItemDelete(query as CFDictionary)
  }

  /// Lê e remove o pedido deixado por um App Intent (ex.: "Conversar com Jarvis").
  static func consumePending() -> [String: Any]? {
    let defaults = UserDefaults.standard
    guard let value = defaults.dictionary(forKey: pendingKey) else { return nil }
    defaults.removeObject(forKey: pendingKey)
    // Ignora pedidos antigos (mais de 2 minutos).
    if let at = value["at"] as? Double, Date().timeIntervalSince1970 - at > 120 { return nil }
    return value
  }
}

public class JarvisNativeModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("JarvisNative")

    Events("onIntent")

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: JarvisBridgeStore.intentNotification, object: nil, queue: .main
      ) { [weak self] _ in
        if let pending = JarvisBridgeStore.consumePending() {
          self?.sendEvent("onIntent", pending)
        }
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
      }
    }

    Function("consumePendingIntent") { () -> [String: Any]? in
      return JarvisBridgeStore.consumePending()
    }

    AsyncFunction("setCredentials") { (apiUrl: String, token: String) in
      try JarvisBridgeStore.saveCredentials(apiUrl: apiUrl, token: token)
    }

    Function("hasCredentials") { () -> Bool in
      return JarvisBridgeStore.hasCredentials()
    }

    Function("clearCredentials") {
      JarvisBridgeStore.clearCredentials()
    }
  }
}
