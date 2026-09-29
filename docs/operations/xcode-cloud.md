# Xcode Cloud (iOS 1.0.7)

Xcode Cloud arkiverar Capacitor-skalet `se.korpasset.app` och skickar det till TestFlight. Webbinnehållet kommer från `https://korpasset.se/app`; det här bygget är bara native-skalet (1.0.7, build 7).

Första workflow kan **inte** skapas från Linux. Repo-filerna nedan räcker för att Xcode eller App Store Connect ska kunna starta ett Archive-bygge mot team `PQ7M3B7VW5`.

## Vad som ligger i git

| Fil | Syfte |
| --- | --- |
| [`native/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`](../../native/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme) | Delat schema `App` med Archive i Release |
| [`native/ios/App/App.xcworkspace`](../../native/ios/App/App.xcworkspace) | Workspace som bara wrappar `App.xcodeproj` (ingen CocoaPods) |
| [`native/ios/App/ci_scripts/ci_post_clone.sh`](../../native/ios/App/ci_scripts/ci_post_clone.sh) | Node 22, `npm ci`, `npx cap sync ios` |

Project/workspace i Xcode Cloud ska vara **`native/ios/App/App.xcodeproj`** eller **`native/ios/App/App.xcworkspace`**. Inte `ios/App/App.xcworkspace` — det är Capacitor-default när `ios/` ligger i repots rot. Här ligger skalet under `native/`.

`ci_scripts/` måste ligga **bredvid** `App.xcodeproj`. Xcode Cloud kör scriptet efter clone och före Swift Package-resolve. Det behövs eftersom `CapApp-SPM` pekar på `native/node_modules` och `App/public`, `capacitor.config.json` samt `config.xml` är gitignorade.

Lokalt på Mac är stegen desamma som scriptet: `cd native && npm ci && npx cap sync ios`. Se [native-apps.md](native-apps.md).

## En gång: skapa workflow

Gör detta inloggad på Papa Bravo-teamet (`PQ7M3B7VW5`), inte My Starday-appen.

### App Store Connect

1. [Apps → Körpasset](https://appstoreconnect.apple.com/apps) → **Xcode Cloud**.
2. **Get Started** / **Create Workflow**.
3. Koppla GitHub-repot `pontusburman-papabravo/korpasset` (GitHub-appen Xcode Cloud måste ha tillgång).
4. Product / project: `native/ios/App/App.xcodeproj` eller `native/ios/App/App.xcworkspace`. Inte `ios/App/…`.
5. Scheme: **App** (det delade schemat).
6. Action: **Archive** → iOS → destination **TestFlight Internal Testing**.
7. Environment: Recommended Xcode + macOS. Signing lämnas automatisk (`DEVELOPMENT_TEAM` är redan `PQ7M3B7VW5`).
8. Start condition: **Manual** för första 1.0.7-bygget. Efter att det gått grönt kan du lägga till push till `main` eller en tagg.

### Eller från Xcode på Mac

```bash
cd native
git pull
npm ci
npx cap sync ios
npx cap open ios
```

Product → Xcode Cloud → Create Workflow. Samma project, scheme `App`, Archive → TestFlight.

## Första bygget (1.0.7)

Starta workflow manuellt mot `main` efter att den här revisionen är mergad. Marketing version och build står redan i [`project.pbxproj`](../../native/ios/App/App.xcodeproj/project.pbxproj): `1.0.7` / `7`.

När bygget är grönt ligger IPA i TestFlight. Ladda **inte** upp en extra arkivfil från en lokal Mac för samma build-nummer.

Review notes för 5.1.2(i): [app-store-review-notes.md](app-store-review-notes.md). Skicka inte 1.0.7 till App Review förrän TestFlight-bygget är verifierat utan cookie-prompt.

## Om post-clone faller

Byggloggen visar `ci_post_clone.sh`. Vanliga fel:

| Symptom | Orsak |
| --- | --- |
| `Workspace App.xcworkspace does not exist at ios/App/App.xcworkspace` | Workflow **General** pekar på fel sökväg. Byt till `native/ios/App/App.xcodeproj` eller `native/ios/App/App.xcworkspace` |
| `CapApp-SPM` hittar inte `@capacitor/app` | `npm ci` kördes inte, eller fel working directory |
| Missing `public` / `capacitor.config.json` | `npx cap sync ios` kördes inte |
| Inget schema i workflow-listan | `App.xcscheme` är inte committad under `xcshareddata` |
| Signing / team | Fel Apple-team valt, eller GitHub-koppling mot fel org |

CocoaPods behövs inte. iOS-projektet använder bara SPM.
