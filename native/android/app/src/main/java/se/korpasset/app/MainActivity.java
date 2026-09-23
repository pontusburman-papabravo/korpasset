package se.korpasset.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openIncomingLink(intent);
    }

    private void openIncomingLink(Intent intent) {
        if (intent == null || bridge == null || bridge.getWebView() == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        String target = InviteLink.webUrl(data.getScheme(), data.getHost(), data.getPath(), data.getQuery());
        if (target == null) return;
        bridge.getWebView().loadUrl(target);
    }
}
