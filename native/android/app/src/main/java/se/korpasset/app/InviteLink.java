package se.korpasset.app;

import java.util.Locale;
import java.util.regex.Pattern;

/** Maps an incoming app link to a page on https://korpasset.se. */
public final class InviteLink {
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]+$");

    private InviteLink() {}

    public static String webUrl(String scheme, String host, String path, String query) {
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
        if ("korpasset".equals(scheme) && "invite".equals(host)) {
            String token = path == null ? "" : path.replaceAll("^/+", "");
            if (!TOKEN.matcher(token).matches()) return null;
            return "https://korpasset.se/invite/" + token;
        }
        return null;
    }

    private static boolean allowed(String path) {
        if ("/app".equals(path) || "/onboarding".equals(path) || "/konto".equals(path)) return true;
        if (!path.startsWith("/invite/")) return false;
        return TOKEN.matcher(path.substring("/invite/".length())).matches();
    }
}
