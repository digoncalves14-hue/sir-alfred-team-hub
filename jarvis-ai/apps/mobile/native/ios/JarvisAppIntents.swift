// JARVIS AI — App Intents (Siri, Atalhos, Botão de Ação, Spotlight).
// Este arquivo é copiado para o alvo principal do app pelo config plugin
// `plugins/withJarvisAppIntents.js` durante o `expo prebuild`. Não edite a cópia em ios/.
//
// Intents que ABREM o app (conversar, perguntar, abrir) deixam um pedido que o app lê ao abrir.
// Intents em SEGUNDO PLANO (resumo, agenda, tarefa, memória) chamam o backend com um token de
// aparelho de escopo restrito, guardado no Keychain quando o usuário ativa os atalhos no app.

import AppIntents
import Foundation
import Security

// MARK: - Armazenamento compartilhado com o módulo nativo (JarvisBridgeStore)

enum JarvisIntentStore {
  static let keychainService = "com.jarvisai.device"
  static let keychainAccount = "credentials"
  static let pendingKey = "jarvis.pendingIntent"
  static let intentNotification = Notification.Name("JarvisIntentReceived")

  static func setPending(action: String, text: String? = nil) {
    var value: [String: Any] = ["action": action, "at": Date().timeIntervalSince1970]
    if let text = text {
      value["text"] = text
    }
    UserDefaults.standard.set(value, forKey: pendingKey)
    NotificationCenter.default.post(name: intentNotification, object: nil)
  }

  static func credentials() -> (apiUrl: String, token: String)? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
      let apiUrl = json["apiUrl"],
      let token = json["token"]
    else { return nil }
    return (apiUrl, token)
  }
}

// MARK: - Cliente HTTP mínimo

enum JarvisIntentError: Error, CustomLocalizedStringResourceConvertible {
  case notConfigured
  case server(String)

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .notConfigured:
      return "Abra o app JARVIS e ative os atalhos da Siri em Ajustes."
    case .server(let message):
      return LocalizedStringResource(stringLiteral: message)
    }
  }
}

enum JarvisAPI {
  private struct SpeechResponse: Decodable {
    let speech: String
  }

  private struct ErrorResponse: Decodable {
    struct Body: Decodable {
      let message: String
    }
    let error: Body
  }

  static func speech(_ path: String, method: String = "GET", body: [String: String]? = nil) async throws -> String {
    guard let creds = JarvisIntentStore.credentials(), let url = URL(string: creds.apiUrl + path) else {
      throw JarvisIntentError.notConfigured
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = 20
    request.httpMethod = method
    request.setValue("Device \(creds.token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let body = body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw JarvisIntentError.server("Não consegui falar com o servidor do Jarvis.")
    }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if (200..<300).contains(status), let decoded = try? JSONDecoder().decode(SpeechResponse.self, from: data) {
      return decoded.speech
    }
    if let decoded = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
      throw JarvisIntentError.server(decoded.error.message)
    }
    throw JarvisIntentError.server("O servidor do Jarvis respondeu com erro \(status).")
  }
}

// MARK: - Intents que abrem o app

struct ConversarComJarvisIntent: AppIntent {
  static let title: LocalizedStringResource = "Conversar com Jarvis"
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    JarvisIntentStore.setPending(action: "listen")
    return .result()
  }
}

struct AbrirJarvisIntent: AppIntent {
  static let title: LocalizedStringResource = "Abrir Jarvis"
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    JarvisIntentStore.setPending(action: "open")
    return .result()
  }
}

struct PerguntarAoJarvisIntent: AppIntent {
  static let title: LocalizedStringResource = "Perguntar ao Jarvis"
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Pergunta")
  var pergunta: String

  @MainActor
  func perform() async throws -> some IntentResult {
    JarvisIntentStore.setPending(action: "ask", text: pergunta)
    return .result()
  }
}

// MARK: - Intents em segundo plano (Siri responde sem abrir o app)

struct ResumoDoDiaIntent: AppIntent {
  static let title: LocalizedStringResource = "Resumo do dia"

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let speech = try await JarvisAPI.speech("/v1/intents/summary")
    return .result(value: speech, dialog: IntentDialog(stringLiteral: speech))
  }
}

enum DiaAgenda: String, AppEnum {
  case hoje
  case amanha

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Dia"
  static let caseDisplayRepresentations: [DiaAgenda: DisplayRepresentation] = [
    .hoje: "Hoje",
    .amanha: "Amanhã",
  ]
}

struct ConsultarAgendaIntent: AppIntent {
  static let title: LocalizedStringResource = "Consultar agenda"

  @Parameter(title: "Dia", default: .hoje)
  var dia: DiaAgenda

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let speech = try await JarvisAPI.speech("/v1/intents/agenda?dia=\(dia.rawValue)")
    return .result(value: speech, dialog: IntentDialog(stringLiteral: speech))
  }
}

struct RegistrarTarefaIntent: AppIntent {
  static let title: LocalizedStringResource = "Registrar tarefa"

  @Parameter(title: "Tarefa")
  var titulo: String

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let speech = try await JarvisAPI.speech("/v1/intents/tasks", method: "POST", body: ["titulo": titulo])
    return .result(value: speech, dialog: IntentDialog(stringLiteral: speech))
  }
}

/// Também serve como destino da Folha de Compartilhamento (via um atalho que recebe texto/URL).
struct SalvarNaMemoriaIntent: AppIntent {
  static let title: LocalizedStringResource = "Salvar na memória do Jarvis"

  @Parameter(title: "Texto")
  var texto: String

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let speech = try await JarvisAPI.speech("/v1/intents/memory", method: "POST", body: ["texto": texto])
    return .result(value: speech, dialog: IntentDialog(stringLiteral: speech))
  }
}

// MARK: - Atalhos prontos (aparecem na Siri, no app Atalhos, no Spotlight e no Botão de Ação)

struct JarvisShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: ConversarComJarvisIntent(),
      phrases: [
        "Conversar com \(.applicationName)",
        "Falar com \(.applicationName)",
        "Chamar \(.applicationName)",
      ],
      shortTitle: "Conversar",
      systemImageName: "waveform.circle.fill"
    )
    AppShortcut(
      intent: ResumoDoDiaIntent(),
      phrases: [
        "Resumo do dia no \(.applicationName)",
        "O que temos para hoje no \(.applicationName)",
      ],
      shortTitle: "Resumo do dia",
      systemImageName: "sun.max.fill"
    )
    AppShortcut(
      intent: ConsultarAgendaIntent(),
      phrases: [
        "Consultar agenda no \(.applicationName)",
        "Agenda do \(.applicationName)",
      ],
      shortTitle: "Agenda",
      systemImageName: "calendar"
    )
    AppShortcut(
      intent: RegistrarTarefaIntent(),
      phrases: [
        "Registrar tarefa no \(.applicationName)",
        "Nova tarefa no \(.applicationName)",
      ],
      shortTitle: "Registrar tarefa",
      systemImageName: "checklist"
    )
    AppShortcut(
      intent: AbrirJarvisIntent(),
      phrases: ["Abrir \(.applicationName)"],
      shortTitle: "Abrir",
      systemImageName: "circle.hexagongrid.fill"
    )
  }
}
