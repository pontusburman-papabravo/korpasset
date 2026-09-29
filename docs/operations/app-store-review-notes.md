# App Store Review notes (iOS 1.0.7)

Guideline 5.1.2(i): The iOS app does not track users and does not collect cookies for tracking.

The iOS application is a Capacitor shell that loads https://korpasset.se/app. That product surface no longer includes a cookie banner, cookie settings control, Google Analytics, or Meta Pixel. The HTML served to /app and the rest of the in-app product does not contain “Godkänn alla”, “Anpassa cookies”, or other tracking-cookie prompts.

The public website korpasset.se may still show a cookie choice in Safari after the visitor is not in the app. That website consent can include Meta Pixel and Google Analytics 4. Those scripts are not loaded in the iOS app, do not run when the native-app cookie `korpasset_native` is present, do not create `_fbp` or `_ga` in the app, and do not perform cross-app or cross-site advertising tracking.

The iOS app therefore does not use App Tracking Transparency and should not be declared as tracking users. There is no ATT permission dialog because there is no tracking to permit.

No login is required to verify this: open the app and confirm that the first screen has no cookie prompt and that no requests are made to `connect.facebook.net`, `facebook.com/tr`, or `googletagmanager.com`. Cookie policy in the app (Mer → Cookies, or Konto → Cookies) states that the app does not track users and does not show a tracking-cookie prompt.

Account deletion: More → Delete account → type RADERA → Delete my account. In the app that is Mer → Radera konto → skriv RADERA → Radera mitt konto. No email to support and no separate website login are required. For a Sign in with Apple account that has a stored refresh token, the server revokes that token with Apple before the Körpasset account is deleted. A reviewer can create an account with Sign in with Apple and delete it from Mer → Radera konto.
