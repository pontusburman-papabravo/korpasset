import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var pendingInviteURL: URL?
    private var applyAttempts = 0
    private var loadCount = 0
    private var applyWorkItem: DispatchWorkItem?
    private let maxApplyAttempts = 40
    private let maxLoads = 3

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if window == nil, let windowScene = scene as? UIWindowScene {
            window = UIWindow(windowScene: windowScene)
            window?.rootViewController = CAPBridgeViewController()
            window?.makeKeyAndVisible()
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        if let url = incomingURL(from: connectionOptions) {
            openInApp(url, event: "cold start")
        } else {
            UserDefaults.standard.removeObject(forKey: SceneDelegate.pendingDefaultsKey)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        if let url = URLContexts.first?.url {
            openInApp(url, event: "appUrlOpen")
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {
            openInApp(url, event: "appUrlOpen")
        }
    }

    private func incomingURL(from options: UIScene.ConnectionOptions) -> URL? {
        if let url = options.urlContexts.first?.url {
            return url
        }
        return options.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb })?.webpageURL
    }

    private func openInApp(_ url: URL, event: String) {
        log("raw=\(url.absoluteString) event=\(event)")
        guard let target = SceneDelegate.webURL(from: url) else {
            log("early-return unparsed event=\(event)")
            return
        }
        pendingInviteURL = target
        applyAttempts = 0
        loadCount = 0
        UserDefaults.standard.set(target.absoluteString, forKey: SceneDelegate.pendingDefaultsKey)
        log("parsed dest=\(target.absoluteString) event=\(event)")
        applyPendingInvite(event: event)
    }

    private func applyPendingInvite(event: String) {
        applyWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.applyPendingInviteNow(event: event)
        }
        applyWorkItem = work
        DispatchQueue.main.async(execute: work)
    }

    private func applyPendingInviteNow(event: String) {
        guard let target = pendingInviteURL else {
            log("early-return no-pending event=\(event)")
            return
        }
        guard let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView else {
            log("early-return webView-nil attempt=\(applyAttempts) event=\(event)")
            scheduleRetry(event: event)
            return
        }

        let current = webView.url?.absoluteString ?? ""
        log("current=\(current.isEmpty ? "-" : current) dest=\(target.absoluteString) attempt=\(applyAttempts) event=\(event)")

        if SceneDelegate.isInvite(webView.url, matching: target) {
            injectPending(into: webView, target: target, event: event, navigate: false)
            log("already-on-invite pending-saved=true event=\(event)")
            pendingInviteURL = nil
            UserDefaults.standard.removeObject(forKey: SceneDelegate.pendingDefaultsKey)
            return
        }

        if SceneDelegate.isKorpassetOrigin(webView.url) {
            injectPending(into: webView, target: target, event: event, navigate: true)
        }

        if loadCount < maxLoads {
            webView.load(URLRequest(url: target))
            loadCount += 1
            log("webview-load dest=\(target.absoluteString) load=\(loadCount) event=\(event)")
        }

        scheduleRetry(event: event)
    }

    private func injectPending(into webView: WKWebView, target: URL, event: String, navigate: Bool) {
        guard let token = SceneDelegate.inviteToken(from: target) else { return }
        let tokenJSON = SceneDelegate.jsonString(token)
        let eventJSON = SceneDelegate.jsonString(event)
        let navigateJS = navigate
            ? "var dest='/invite/'+\(tokenJSON);if(location.pathname!==dest){location.assign(dest);}"
            : ""
        let js = """
        (function(){
          try {
            sessionStorage.setItem('korpasset.pendingInvite', \(tokenJSON));
            sessionStorage.setItem('korpasset.deeplinkNativeEvent', \(eventJSON));
            if (window.KORPASSET_DEEPLINK && window.KORPASSET_DEEPLINK.consumeIncomingUrl) {
              window.KORPASSET_DEEPLINK.consumeIncomingUrl('https://korpasset.se/invite/' + \(tokenJSON), \(eventJSON));
              return;
            }
            \(navigateJS)
          } catch (e) {}
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: { _, error in
            if let error {
                Self.log("inject-error \(error.localizedDescription)")
            } else {
                Self.log("pending-saved token-present navigate=\(navigate)")
            }
        })
    }

    private func scheduleRetry(event: String) {
        applyAttempts += 1
        if applyAttempts >= maxApplyAttempts {
            log("early-return give-up event=\(event)")
            return
        }
        let work = DispatchWorkItem { [weak self] in
            self?.applyPendingInviteNow(event: event)
        }
        applyWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
    }

    private func log(_ message: String) {
        SceneDelegate.log(message)
    }

    private static func log(_ message: String) {
        NSLog("[korpasset-deeplink] %@", message)
    }

    private static let pendingDefaultsKey = "korpasset.pendingInviteURL"

    /// Universal Links and korpasset://invite/<token> stay inside the WebView.
    /// Google's OAuth callback scheme is left untouched.
    static func webURL(from url: URL) -> URL? {
        if let token = inviteToken(from: url) {
            return URL(string: "https://korpasset.se/invite/\(token)")
        }

        if url.scheme == "https" || url.scheme == "http" {
            guard let host = url.host?.lowercased(),
                  host == "korpasset.se" || host == "www.korpasset.se",
                  allowed(path: url.path) else { return nil }
            guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
            components.scheme = "https"
            components.host = "korpasset.se"
            return components.url
        }

        return nil
    }

    static func inviteToken(from url: URL) -> String? {
        if url.scheme == "korpasset" {
            if url.host == "invite" {
                return validToken(url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
            }
            let path = url.path
            if path.hasPrefix("/invite/") {
                return validToken(String(path.dropFirst("/invite/".count)).trimmingCharacters(in: CharacterSet(charactersIn: "/")))
            }
            return nil
        }

        guard url.scheme == "https" || url.scheme == "http" else { return nil }
        guard let host = url.host?.lowercased(),
              host == "korpasset.se" || host == "www.korpasset.se" else { return nil }
        guard url.path.hasPrefix("/invite/") else { return nil }
        return validToken(String(url.path.dropFirst("/invite/".count)).trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }

    private static func isInvite(_ url: URL?, matching target: URL) -> Bool {
        guard let url, let current = inviteToken(from: url), let wanted = inviteToken(from: target) else {
            return false
        }
        return current == wanted
    }

    private static func isKorpassetOrigin(_ url: URL?) -> Bool {
        guard let host = url?.host?.lowercased() else { return false }
        return host == "korpasset.se" || host == "www.korpasset.se"
    }

    private static func allowed(path: String) -> Bool {
        if path == "/app" || path == "/onboarding" || path == "/konto" {
            return true
        }
        guard path.hasPrefix("/invite/") else { return false }
        return validToken(String(path.dropFirst("/invite/".count))) != nil
    }

    private static func validToken(_ token: String) -> String? {
        token.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil ? token : nil
    }

    private static func jsonString(_ value: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: value, options: .fragmentsAllowed)
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
    }
}
