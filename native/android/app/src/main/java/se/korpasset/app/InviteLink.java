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
