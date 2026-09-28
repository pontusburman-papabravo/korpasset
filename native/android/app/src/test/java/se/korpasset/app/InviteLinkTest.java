package se.korpasset.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class InviteLinkTest {
    @Test
    public void loadsHttpsInviteInsideTheApp() {
        assertEquals(
            "https://korpasset.se/invite/abc_DEF-123",
            InviteLink.webUrl("https", "korpasset.se", "/invite/abc_DEF-123", null)
        );
    }

    @Test
    public void loadsCustomSchemeInviteInsideTheApp() {
        assertEquals(
            "https://korpasset.se/invite/abc_DEF-123",
            InviteLink.webUrl("korpasset", "invite", "/abc_DEF-123", null)
        );
    }

    @Test
    public void keepsOnboardingQuery() {
        assertEquals(
            "https://korpasset.se/onboarding?som=elev&via=handledare",
            InviteLink.webUrl("https", "www.korpasset.se", "/onboarding", "som=elev&via=handledare")
        );
    }

    @Test
    public void parsesThreeSlashCustomScheme() {
        assertEquals(
            "tok_1",
            InviteLink.inviteToken("korpasset", "", "/invite/tok_1")
        );
        assertEquals(
            "https://korpasset.se/invite/tok_1",
            InviteLink.webUrl("korpasset", "", "/invite/tok_1", null)
        );
    }

    @Test
    public void treatsAppStartupAsNotAnInvite() {
        assertNull(InviteLink.inviteToken("https", "korpasset.se", "/app"));
        assertEquals(
            "https://korpasset.se/app",
            InviteLink.webUrl("https", "korpasset.se", "/app", null)
        );
    }

    @Test
    public void doesNotReloadAppWhenAlreadyOnApp() {
        assertTrue(InviteLink.isSamePage("https://korpasset.se/app", "https://korpasset.se/app"));
        assertTrue(InviteLink.isSamePage("https://www.korpasset.se/app", "https://korpasset.se/app"));
        assertFalse(InviteLink.shouldLoadWebView("https://korpasset.se/app", "https://korpasset.se/app"));
        assertTrue(InviteLink.shouldLoadWebView("https://korpasset.se/app", "https://korpasset.se/invite/abc"));
    }

    @Test
    public void doesNotOverlayALivePageWithBareAppShell() {
        assertTrue(InviteLink.isAppShell("https://korpasset.se/app"));
        assertTrue(InviteLink.isAppShell("https://korpasset.se/onboarding"));
        assertTrue(InviteLink.isAppShell("https://korpasset.se/konto"));
        assertFalse(InviteLink.isAppShell("https://korpasset.se/invite/abc"));
        assertFalse(InviteLink.shouldLoadWebView(
            "https://korpasset.se/onboarding",
            "https://korpasset.se/app"
        ));
        assertFalse(InviteLink.shouldLoadWebView(
            "https://korpasset.se/konto",
            "https://korpasset.se/app"
        ));
        assertFalse(InviteLink.shouldLoadWebView(
            "https://korpasset.se/app",
            "https://korpasset.se/onboarding"
        ));
        assertTrue(InviteLink.shouldLoadWebView(
            "https://korpasset.se/app",
            "https://korpasset.se/invite/abc"
        ));
        assertTrue(InviteLink.shouldLoadWebView(
            "",
            "https://korpasset.se/app"
        ));
        assertTrue(InviteLink.shouldLoadWebView(
            "https://localhost/",
            "https://korpasset.se/app"
        ));
    }

    @Test
    public void stillLoadsAnOauthHandoffOntoTheLoginPage() {
        String current = "https://korpasset.se/app";
        String target = "https://korpasset.se/app?oauth_handoff=handoffcodehandoffcode12";
        assertTrue(InviteLink.hasOAuthHandoff(target));
        assertFalse(InviteLink.hasOAuthHandoff(current));
        assertTrue(InviteLink.shouldLoadWebView(current, target));
        assertFalse(InviteLink.shouldLoadWebView(target, target));
        assertTrue(InviteLink.authRecoverJs("native-resume").contains("KORPASSET_AUTH"));
        assertFalse(InviteLink.authRecoverJs("native-resume").contains("handoffcode"));
    }

    @Test
    public void ignoresOtherSchemesAndHosts() {
        assertNull(InviteLink.webUrl("com.googleusercontent.apps.example", "oauth", "/callback", null));
        assertNull(InviteLink.webUrl("https", "example.com", "/invite/abc", null));
        assertNull(InviteLink.webUrl("korpasset", "invite", "/not a token", null));
        assertNull(InviteLink.inviteToken("korpasset", "invite", "/bad token"));
    }
}
