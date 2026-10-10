#!/usr/bin/env python3
"""Check an adapted Caddy JSON config for the production routing contract.

The input is `caddy adapt` output for deploy/Caddyfile. The checks describe
the behavior that must survive a container restart: public ACME for all four
hostnames, Körpasset's reverse proxy, and the Papa Bravo static site.
"""

from __future__ import annotations

import json
import sys
from typing import Any


CSP = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; "
    "frame-ancestors 'none'; form-action 'self' mailto:; script-src 'self'; "
    "style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'"
)
LEGACY = [
    "/startsida",
    "/startsida/",
    "/startsida/lab",
    "/startsida/lab/",
    "/startsida/lab/spel-tetsudo",
    "/startsida/lab/spel-tetsudo/",
    "/startsida/lab/spel-m-tetsudo",
    "/startsida/lab/spel-m-tetsudo/",
]
KORPASSET_HEADERS = {
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}
PAPABRAVO_HEADERS = {
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def walk(node: Any):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk(value)


def hosts_of(route: dict[str, Any]) -> tuple[str, ...]:
    found: list[str] = []
    for matcher in route.get("match") or []:
        found.extend(matcher.get("host") or [])
    return tuple(found)


def static_locations(route: dict[str, Any]) -> list[tuple[int, str]]:
    found = []
    for node in walk(route):
        if node.get("handler") != "static_response":
            continue
        headers = node.get("headers") or {}
        location = (headers.get("Location") or [None])[0]
        found.append((node.get("status_code"), location))
    return found


def header_ops(route: dict[str, Any]) -> list[dict[str, Any]]:
    return [node["response"] for node in walk(route) if node.get("handler") == "headers"]


def load(path: str) -> dict[str, Any]:
    text = open(path, encoding="utf-8").read()
    start = text.find("{")
    if start < 0:
        fail(f"{path} does not contain JSON")
    return json.loads(text[start:])


def server_by_listen(servers: dict[str, Any], listen: str) -> list[dict[str, Any]]:
    return [server for server in servers.values() if server.get("listen") == [listen]]


def route_by_host(server: dict[str, Any], host: str) -> dict[str, Any]:
    matches = [route for route in server.get("routes") or [] if hosts_of(route) == (host,)]
    if len(matches) != 1:
        fail(f"{server.get('listen')} has {len(matches)} routes for {host}")
    return matches[0]


def main() -> None:
    if len(sys.argv) != 2:
        fail(f"usage: {sys.argv[0]} adapted.json")
    config = load(sys.argv[1])
    encoded = json.dumps(config)
    if "upgrade-insecure-requests" in encoded:
        fail("CSP must not add upgrade-insecure-requests")
    if '"internal"' in encoded:
        fail("config requests internal TLS")

    https_servers = server_by_listen(config["apps"]["http"]["servers"], ":443")
    http_servers = server_by_listen(config["apps"]["http"]["servers"], ":80")
    if len(https_servers) != 1:
        fail(f"expected one :443 server, found {len(https_servers)}")
    if len(http_servers) != 1:
        fail(f"expected one :80 server, found {len(http_servers)}")
    https = https_servers[0]
    plain = http_servers[0]

    for host in ("korpasset.se", "www.korpasset.se", "papabravo.se", "www.papabravo.se"):
        route_by_host(https, host)
    if [hosts_of(route) for route in plain.get("routes") or []] != [("www.papabravo.se",)]:
        fail(":80 server must only redirect www.papabravo.se")

    www_papa_http = static_locations(route_by_host(plain, "www.papabravo.se"))
    www_papa_https = static_locations(route_by_host(https, "www.papabravo.se"))
    www_korpasset = static_locations(route_by_host(https, "www.korpasset.se"))
    if www_papa_http != [(301, "https://papabravo.se{http.request.uri}")]:
        fail(f"unexpected HTTP www.papabravo.se redirect: {www_papa_http}")
    if www_papa_https != [(301, "https://papabravo.se{http.request.uri}")]:
        fail(f"unexpected HTTPS www.papabravo.se redirect: {www_papa_https}")
    if www_korpasset != [(301, "https://korpasset.se{http.request.uri}")]:
        fail(f"unexpected www.korpasset.se redirect: {www_korpasset}")

    papa = route_by_host(https, "papabravo.se")
    papa_locations = static_locations(papa)
    if (301, "https://papabravo.se/") not in papa_locations:
        fail("legacy Papa Bravo paths do not redirect home")
    if (301, "https://papabravo.se{http.regexp.slash.1}") not in papa_locations:
        fail("trailing-slash redirect is missing")
    legacy = [
        matcher.get("path")
        for node in walk(papa)
        for matcher in node.get("match") or []
        if matcher.get("path") and "/startsida" in matcher["path"]
    ]
    if legacy != [LEGACY]:
        fail(f"legacy paths changed: {legacy}")
    slash = [
        matcher["path_regexp"]
        for node in walk(papa)
        for matcher in node.get("match") or []
        if "path_regexp" in matcher
    ]
    if slash != [{"name": "slash", "pattern": "^(.+)/$"}]:
        fail(f"trailing-slash matcher changed: {slash}")

    roots = [node.get("root") for node in walk(papa) if node.get("root")]
    if roots != ["/data/sites/papabravo"]:
        fail(f"Papa Bravo root changed: {roots}")
    try_files = [
        matcher["file"]["try_files"]
        for node in walk(papa)
        for matcher in node.get("match") or []
        if matcher.get("file", {}).get("try_files")
    ]
    expected_try = [
        "{http.request.uri.path}",
        "{http.request.uri.path}.html",
        "{http.request.uri.path}/index.html",
    ]
    if try_files != [expected_try]:
        fail(f"try_files changed: {try_files}")
    hides = [node.get("hide") for node in walk(papa) if node.get("handler") == "file_server"]
    if hides != [["/etc/caddy/Caddyfile"]]:
        fail(f"file_server hide changed: {hides}")
    error_routes = [
        route
        for route in (https.get("errors") or {}).get("routes") or []
        if hosts_of(route) == ("papabravo.se",)
    ]
    if len(error_routes) != 1:
        fail(f"expected one Papa Bravo error route, found {len(error_routes)}")
    error_roots = [node.get("root") for node in walk(error_routes[0]) if node.get("root")]
    error_rewrites = [node.get("uri") for node in walk(error_routes[0]) if node.get("handler") == "rewrite"]
    error_hides = [node.get("hide") for node in walk(error_routes[0]) if node.get("handler") == "file_server"]
    if error_roots != ["/data/sites/papabravo"] or error_rewrites != ["/404.html"]:
        fail(f"custom 404 changed: roots={error_roots} rewrites={error_rewrites}")
    if error_hides != [["/etc/caddy/Caddyfile"]]:
        fail(f"404 file_server hide changed: {error_hides}")

    papa_headers = header_ops(papa)
    cache = [item.get("set", {}).get("Cache-Control") for item in papa_headers]
    if ["public, max-age=31536000, immutable"] not in cache:
        fail(f"static cache policy changed: {cache}")
    if ["public, max-age=300"] not in cache:
        fail(f"HTML cache policy changed: {cache}")
    security = [
        item
        for item in papa_headers
        if item.get("delete") == ["Server"] and item.get("deferred") is True
    ]
    if len(security) != 1:
        fail("deferred Server removal is missing")
    got = {key: values[0] for key, values in security[0]["set"].items()}
    if got != PAPABRAVO_HEADERS:
        fail(f"Papa Bravo security headers changed: {got}")
    csp = [
        item
        for item in papa_headers
        if item.get("set", {}).get("Content-Security-Policy") == [CSP] and not item.get("deferred")
    ]
    if len(csp) != 1:
        fail("immediate Papa Bravo CSP is missing")

    encodes = [
        (node.get("prefer"), sorted((node.get("encodings") or {})))
        for node in walk(papa)
        if node.get("handler") == "encode"
    ]
    if encodes != [(["zstd", "gzip"], ["gzip", "zstd"])]:
        fail(f"Papa Bravo compression changed: {encodes}")

    korpasset = route_by_host(https, "korpasset.se")
    upstreams = [
        upstream.get("dial")
        for node in walk(korpasset)
        if node.get("handler") == "reverse_proxy"
        for upstream in node.get("upstreams") or []
    ]
    if upstreams != ["app:3000"]:
        fail(f"Körpasset upstream changed: {upstreams}")
    korpasset_headers = header_ops(korpasset)
    if len(korpasset_headers) != 1:
        fail(f"expected one Körpasset header handler, found {len(korpasset_headers)}")
    got = {key: values[0] for key, values in korpasset_headers[0]["set"].items()}
    if got != KORPASSET_HEADERS:
        fail(f"Körpasset headers changed: {got}")
    korpasset_encode = [
        (node.get("prefer"), sorted((node.get("encodings") or {})))
        for node in walk(korpasset)
        if node.get("handler") == "encode"
    ]
    if korpasset_encode != [(["gzip", "zstd"], ["gzip", "zstd"])]:
        fail(f"Körpasset compression changed: {korpasset_encode}")
    excluded = [
        matcher["not"][0]["path"]
        for node in walk(korpasset)
        for matcher in node.get("match") or []
        if matcher.get("not")
    ]
    if excluded != [[
        "/.well-known/apple-app-site-association",
        "/.well-known/assetlinks.json",
    ]]:
        fail(f"Körpasset compression exclusion changed: {excluded}")

    policies = config["apps"]["tls"]["automation"]["policies"]
    if len(policies) != 1:
        fail(f"expected one ACME policy, found {len(policies)}")
    subjects = policies[0]["subjects"]
    if subjects != [
        "www.korpasset.se",
        "www.papabravo.se",
        "korpasset.se",
        "papabravo.se",
    ]:
        fail(f"ACME subjects changed: {subjects}")
    issuers = policies[0]["issuers"]
    if [issuer.get("module") for issuer in issuers] != ["acme", "acme"]:
        fail(f"TLS issuers are not public ACME: {issuers}")
    if any(issuer.get("email") != "pontus.burman@papabravo.se" for issuer in issuers):
        fail("ACME contact email changed")
    if issuers[1].get("ca") != "https://acme.zerossl.com/v2/DV90":
        fail("ZeroSSL fallback issuer changed")

    print("Caddyfile routing contract holds for all four hostnames")


if __name__ == "__main__":
    main()
