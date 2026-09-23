package se.korpasset.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

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
    public void ignoresOtherSchemesAndHosts() {
        assertNull(InviteLink.webUrl("com.googleusercontent.apps.example", "oauth", "/callback", null));
        assertNull(InviteLink.webUrl("https", "example.com", "/invite/abc", null));
        assertNull(InviteLink.webUrl("korpasset", "invite", "/not a token", null));
    }
}
