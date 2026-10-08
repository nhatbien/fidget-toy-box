import UIKit

/// Game progress (stars, unlocks, settings) as the JSON string produced by the web game.
enum SaveStore {
    private static let key = "fidget-toy-box-save-v1"

    static func save(_ data: String) {
        UserDefaults.standard.set(data, forKey: key)
    }

    /// The saved string as a JavaScript literal for injection (`""` when there is no save yet).
    static func loadAsJSLiteral() -> String {
        let saved = UserDefaults.standard.string(forKey: key) ?? ""
        guard let encoded = try? JSONEncoder().encode(saved), let literal = String(data: encoded, encoding: .utf8) else {
            return "\"\""
        }
        return literal
    }
}

/// Maps the game's vibration lengths onto Taptic Engine impacts.
enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)

    static func play(milliseconds ms: Double) {
        DispatchQueue.main.async {
            switch ms {
            case ..<10: light.impactOccurred(intensity: 0.7)
            case ..<20: light.impactOccurred()
            case ..<35: medium.impactOccurred()
            default: heavy.impactOccurred()
            }
        }
    }
}
