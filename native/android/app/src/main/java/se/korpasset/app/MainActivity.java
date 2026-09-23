package se.korpasset.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "korpasset-deeplink";
    private static final int MAX_ATTEMPTS = 40;
    private static final int MAX_LOADS = 3;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String pendingTarget;
    private String pendingEvent;
    private int applyAttempts;
    private int loadCount;
    private boolean consumedLaunchIntent;
    private final Runnable applyRunnable = this::applyPendingInvite;

    @Override
    public void onStart() {
        super.onStart();
        if (consumedLaunchIntent) return;
        consumedLaunchIntent = true;
        openIncomingLink(getIntent(), "cold start");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openIncomingLink(intent, "appUrlOpen");
    }

    private void openIncomingLink(Intent intent, String event) {
        if (intent == null) {
            log("early-return no-intent event=" + event);
            return;
        }
        Uri data = intent.getData();
        if (data == null) {
            if ("cold start".equals(event) && pendingTarget == null) {
                log("early-return no-url event=" + event);
            }
            return;
        }
        log("raw=" + data + " event=" + event);
        String target = InviteLink.webUrl(data.getScheme(), data.getHost(), data.getPath(), data.getQuery());
        if (target == null) {
            log("early-return unparsed event=" + event);
            return;
        }
        pendingTarget = target;
        pendingEvent = event;
        applyAttempts = 0;
        loadCount = 0;
        log("parsed dest=" + target + " event=" + event);
        handler.removeCallbacks(applyRunnable);
        handler.post(applyRunnable);
    }

    private void applyPendingInvite() {
        if (pendingTarget == null) {
            log("early-return no-pending event=" + pendingEvent);
            return;
        }
        if (bridge == null || bridge.getWebView() == null) {
            log("early-return webView-nil attempt=" + applyAttempts + " event=" + pendingEvent);
            scheduleRetry();
            return;
        }

        WebView webView = bridge.getWebView();
        String current = webView.getUrl() == null ? "" : webView.getUrl();
        log("current=" + (current.isEmpty() ? "-" : current) + " dest=" + pendingTarget + " attempt=" + applyAttempts + " event=" + pendingEvent);

        if (InviteLink.isSameInvite(current, pendingTarget)) {
            webView.evaluateJavascript(InviteLink.pendingInviteJs(pendingTarget, pendingEvent, false), null);
            log("already-on-invite pending-saved=true event=" + pendingEvent);
            pendingTarget = null;
            return;
        }

        if (InviteLink.isKorpassetOrigin(current)) {
            webView.evaluateJavascript(InviteLink.pendingInviteJs(pendingTarget, pendingEvent, true), null);
        }

        if (loadCount < MAX_LOADS) {
            webView.loadUrl(pendingTarget);
            loadCount += 1;
            log("webview-load dest=" + pendingTarget + " load=" + loadCount + " event=" + pendingEvent);
        }

        scheduleRetry();
    }

    private void scheduleRetry() {
        applyAttempts += 1;
        if (applyAttempts >= MAX_ATTEMPTS) {
            log("early-return give-up event=" + pendingEvent);
            return;
        }
        handler.postDelayed(applyRunnable, 150);
    }

    private static void log(String message) {
        Log.i(TAG, message);
    }
}
