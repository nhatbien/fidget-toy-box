import AVFoundation
import SwiftUI

/// Native shell for the HTML5 game: a full-screen WKWebView running the bundled web build.
@main
struct FidgetToyBoxApp: App {
    init() {
        // Ambient: mixes with the player's music and respects the silent switch.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .background(Color("LaunchBackground").ignoresSafeArea())
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .defersSystemGestures(on: .all)
        }
    }
}

struct GameView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GameViewController { GameViewController() }
    func updateUIViewController(_ controller: GameViewController, context: Context) {}
}
