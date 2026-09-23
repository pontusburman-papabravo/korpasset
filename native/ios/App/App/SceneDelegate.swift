import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        if let url = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb })?.webpageURL {
            openInApp(url)
        }
        if let url = connectionOptions.urlContexts.first?.url {
            openInApp(url)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        if let url = URLContexts.first?.url {
            openInApp(url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {
            openInApp(url)
        }
    }

    private func openInApp(_ url: URL) {
        guard let target = SceneDelegate.webURL(from: url) else { return }
        DispatchQueue.main.async { [weak self] in
            guard let webView = (self?.window?.rootViewController as? CAPBridgeViewController)?.webView else { return }
            webView.load(URLRequest(url: target))
        }
    }

    /// Universal Links and korpasset://invite/<token> stay inside the WebView.
    /// Google's OAuth callback scheme is left untouched.
    static func webURL(from url: URL) -> URL? {
        if url.scheme == "https" || url.scheme == "http" {
            guard let host = url.host?.lowercased(),
                  host == "korpasset.se" || host == "www.korpasset.se",
                  allowed(path: url.path) else { return nil }
            guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
            components.scheme = "https"
            components.host = "korpasset.se"
            return components.url
        }

        if url.scheme == "korpasset", url.host == "invite" {
            let token = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard token.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil else { return nil }
            return URL(string: "https://korpasset.se/invite/\(token)")
        }

        return nil
    }

    private static func allowed(path: String) -> Bool {
        if path == "/app" || path == "/onboarding" || path == "/konto" {
            return true
        }
        guard path.hasPrefix("/invite/") else { return false }
        let token = String(path.dropFirst("/invite/".count))
        return token.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil
    }
}
