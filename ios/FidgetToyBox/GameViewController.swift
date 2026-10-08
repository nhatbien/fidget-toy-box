import UIKit
import WebKit

/// Hosts the game page and bridges it to native features:
/// - save data: injected at document start, written back through the `ftb` message handler
/// - haptics: Taptic Engine instead of `navigator.vibrate` (unsupported on iOS)
/// - lifecycle: pauses the game when the app leaves the foreground
final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!
    private static let startURL = URL(string: "\(BundleSchemeHandler.scheme)://game/index.html")!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)

        let content = WKUserContentController()
        content.add(WeakScriptMessageHandler(self), name: "ftb")
        content.addUserScript(WKUserScript(
            source: "window.__FTB_IOS__ = true; window.__FTB_SAVE__ = \(SaveStore.loadAsJSLiteral());",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController = content

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        // Keep the game inside the safe area (notch, Dynamic Island, home indicator).
        let root = UIView()
        root.backgroundColor = UIColor(named: "LaunchBackground")
        webView.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(webView)
        let guide = root.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
        ])
        view = root
        webView.load(URLRequest(url: Self.startURL))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(pauseGame), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(resumeGame), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func pauseGame() {
        webView.evaluateJavaScript("window.__ftbPause && window.__ftbPause()")
    }

    @objc private func resumeGame() {
        webView.evaluateJavaScript("window.__ftbResume && window.__ftbResume()")
    }

    // MARK: - Bridge

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "save":
            if let data = body["data"] as? String { SaveStore.save(data) }
        case "haptic":
            Haptics.play(milliseconds: (body["ms"] as? NSNumber)?.doubleValue ?? 12)
        default:
            break
        }
    }

    /// WebKit can kill the page's process under memory pressure; reload instead of showing a blank screen.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.load(URLRequest(url: Self.startURL))
    }
}

/// Avoids the retain cycle WKUserContentController would create with the view controller.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
