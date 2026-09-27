# App Store Review notes (iOS 1.0)

Advertising and marketing tracking has been disabled when Körpasset runs inside the iOS application. The public website korpasset.se may use optional marketing cookies after browser consent, including Meta Pixel after that consent, but the iOS app does not load Meta Pixel, does not send Meta PageView or Lead events, does not create `_fbp`, and does not perform cross-app or cross-site advertising tracking.

Google Analytics 4 is also disabled in the iOS application. The current GA4 implementation is loaded from Google, can enable advertising consent signals after website marketing consent, and cannot safely be treated as first-party analytics outside Apple’s tracking definition. First-party product events stay on Körpasset’s own server and are not used for advertising.

The iOS app does not show a marketing-cookie choice, does not use App Tracking Transparency, and should not be declared as tracking users.

No login is required to verify this: open the app and confirm that no requests are made to `connect.facebook.net` or `facebook.com/tr`.
