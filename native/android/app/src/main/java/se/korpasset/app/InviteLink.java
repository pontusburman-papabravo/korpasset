package se.korpasset.app;

import java.util.Locale;
import java.util.regex.Pattern;

/** Maps an incoming app link to a page on https://korpasset.se. */
public final class InviteLink {
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]+$");

    private InviteLink() {}

    public static String webUrl(String scheme, String host, String path, String query) {
        String token = inviteToken(scheme, host, path);
        if (token != null) {
            return "https://korpasset.se/invite/" + token;
        }
        if (scheme == null) return null;
        if ("https".equals(scheme) || "http".equals(scheme)) {
            if (host == null) return null;
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            if (!"korpasset.se".equals(normalizedHost) && !"www.korpasset.se".equals(normalizedHost)) {
                return null;
            }
            if (path == null || !allowed(path)) return null;
            String url = "https://korpasset.se" + path;
            if (query != null && !query.isEmpty()) url += "?" + query;
            return url;
        }
        return null;
    }

    public static String inviteToken(String scheme, String host, String path) {
        if (scheme == null) return null;
        if ("korpasset".equals(scheme)) {
            if ("invite".equals(host)) {
                return validToken(path == null ? "" : path.replaceAll("^/+", "").replaceAll("/+$", ""));
            }
            if (path != null && path.startsWith("/invite/")) {
                return validToken(path.substring("/invite/".length()).replaceAll("/+$", ""));
            }
            return null;
        }
        if (!"https".equals(scheme) && !"http".equals(scheme)) return null;
        if (host == null) return null;
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        if (!"korpasset.se".equals(normalizedHost) && !"www.korpasset.se".equals(normalizedHost)) {
            return null;
        }
        if (path == null || !path.startsWith("/invite/")) return null;
        return validToken(path.substring("/invite/".length()).replaceAll("/+$", ""));
    }

    public static boolean isSameInvite(String currentUrl, String targetUrl) {
        String current = tokenFromAbsolute(currentUrl);
        String target = tokenFromAbsolute(targetUrl);
        return current != null && current.equals(target);
    }

    public static boolean hasOAuthHandoff(String url) {
        if (url == null) return false;
        int queryStart = url.indexOf('?');
        if (queryStart < 0) return false;
        String query = url.substring(queryStart + 1);
        int hash = query.indexOf('#');
        if (hash >= 0) query = query.substring(0, hash);
        String[] parts = query.split("&");
        for (String part : parts) {
            if (part.startsWith("oauth_handoff=") && part.length() > "oauth_handoff=".length()) {
                return true;
            }
        }
        return false;
    }

    public static String pageKey(String url) {
        if (!isKorpassetOrigin(url)) return null;
        int schemeEnd = url.indexOf("://");
        if (schemeEnd < 0) return null;
        String rest = url.substring(schemeEnd + 3);
        int slash = rest.indexOf('/');
        if (slash < 0) return null;
        String host = rest.substring(0, slash).toLowerCase(Locale.ROOT);
        if (host.startsWith("www.")) host = host.substring(4);
        String path = rest.substring(slash);
        int query = path.indexOf('?');
        if (query >= 0) path = path.substring(0, query);
        int hash = path.indexOf('#');
        if (hash >= 0) path = path.substring(0, hash);
        if (path.endsWith("/") && path.length() > 1) {
            path = path.substring(0, path.length() - 1);
        }
        return host + path;
    }

    public static boolean isSamePage(String currentUrl, String targetUrl) {
        String current = pageKey(currentUrl);
        String target = pageKey(targetUrl);
        return current != null && current.equals(target);
    }

    /**
     * Bare /app, /onboarding, and /konto App Links must not replace a live
     * Körpasset page. After auth the WebView may already have navigated to
     * /onboarding; a stale /app resume would overlay that route. Session
     * recovery runs in JS instead. oauth_handoff is the only /app query that
     * still forces a load, because the server must redeem it.
     */
    public static boolean shouldLoadWebView(String currentUrl, String targetUrl) {
        if (targetUrl == null || targetUrl.isEmpty()) return false;
        if (hasOAuthHandoff(targetUrl)) {
            return !sameRequest(currentUrl, targetUrl);
        }
        if (isSameInvite(currentUrl, targetUrl)) return false;
        if (isKorpassetOrigin(currentUrl) && isAppShell(targetUrl)) return false;
        return !isSamePage(currentUrl, targetUrl);
    }

    public static boolean isAppShell(String url) {
        String key = pageKey(url);
        if (key == null) return false;
        int slash = key.indexOf('/');
        if (slash < 0) return false;
        String path = key.substring(slash);
        return "/app".equals(path) || "/onboarding".equals(path) || "/konto".equals(path);
    }

    public static String authRecoverJs(String event) {
        String eventJson = jsonString(event == null ? "native-resume" : event);
        return "(function(){try{"
            + "if(window.KORPASSET_AUTH&&window.KORPASSET_AUTH.recover){"
            + "window.KORPASSET_AUTH.recover(" + eventJson + ");"
            + "}"
            + "}catch(e){}})();";
    }

    private static boolean sameRequest(String currentUrl, String targetUrl) {
        if (currentUrl == null || targetUrl == null) return false;
        return stripFragment(currentUrl).equals(stripFragment(targetUrl));
    }

    private static String stripFragment(String url) {
        int hash = url.indexOf('#');
        return hash >= 0 ? url.substring(0, hash) : url;
    }

    public static boolean isKorpassetOrigin(String url) {
        if (url == null) return false;
        return url.startsWith("https://korpasset.se/") || url.startsWith("https://www.korpasset.se/");
    }

    public static String pendingInviteJs(String targetUrl, String event, boolean navigate) {
        String token = tokenFromAbsolute(targetUrl);
        if (token == null) return "(function(){})();";
        String tokenJson = jsonString(token);
        String eventJson = jsonString(event == null ? "native" : event);
        String navigateJs = navigate
            ? "var dest='/invite/'+" + tokenJson + ";if(location.pathname!==dest){location.assign(dest);}"
            : "";
        return "(function(){try{"
            + "sessionStorage.setItem('korpasset.pendingInvite'," + tokenJson + ");"
            + "sessionStorage.setItem('korpasset.deeplinkNativeEvent'," + eventJson + ");"
            + "if(window.KORPASSET_DEEPLINK&&window.KORPASSET_DEEPLINK.consumeIncomingUrl){"
            + "window.KORPASSET_DEEPLINK.consumeIncomingUrl('https://korpasset.se/invite/'+" + tokenJson + "," + eventJson + ");"
            + "return;}"
            + navigateJs
            + "}catch(e){}})();";
    }

    private static String tokenFromAbsolute(String url) {
        if (url == null) return null;
        int schemeEnd = url.indexOf("://");
        if (schemeEnd < 0) return null;
        String rest = url.substring(schemeEnd + 3);
        int slash = rest.indexOf('/');
        if (slash < 0) return null;
        String host = rest.substring(0, slash);
        String path = rest.substring(slash);
        int query = path.indexOf('?');
        if (query >= 0) path = path.substring(0, query);
        return inviteToken(url.substring(0, schemeEnd), host, path);
    }

    private static boolean allowed(String path) {
        if ("/app".equals(path) || "/onboarding".equals(path) || "/konto".equals(path)) return true;
        if (!path.startsWith("/invite/")) return false;
        return validToken(path.substring("/invite/".length())) != null;
    }

    private static String validToken(String token) {
        return TOKEN.matcher(token).matches() ? token : null;
    }

    private static String jsonString(String value) {
        String escaped = value.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"");
        return "\"" + escaped + "\"";
    }
}
