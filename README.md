# Space Trader Classic

A web port of Russell Wolf's (aka Brucelet) Android port of Pieter Spronck's PalmOS game, **Space Trader**. This version was directly adapted from Russell Wolf's v1.3.5, and attempts to be a faithful port. The only features added are import/export of save games and system-based light/dark mode.

The entire game has been ported to HTML/JS/CSS and can be run as an Android native app (via web wrapper), in-browser, or as a Progressive Web App (PWA). To play in browser or install as a PWA, visit https://spacetrader.lunchwine.com.

Full disclosure: the majority of the work was porting the previous Java codebase to HTML/JS, and nearly all of that coding was done by LLMs (with human testing and direction). My goal was to bring back a classic that had brought me many hours of joy, dating back to the PalmOS version in the early 00s, and make it accessible to more people.

This project is actively maintained: builds are kept working and significant bugs are fixed. Issues are welcome, but there is no guaranteed response or personal support.

## Play

Open **index.html** in a current browser. It has no dependencies and works offline. To serve it instead:

```
python3 -m http.server 8000
```

Tap the screen title to open the menu bar: **Command** (screens), **Game** (New Game, Switch Game, Retire,
Options, Shortcuts, High Scores, Export Save, Import Save) and **Help**. Progress is saved automatically in the
browser; Export Save and Import Save move a game between devices. Two games can be kept at once (Switch Game).

## Layout

| Path | Contents |
|---|---|
| `index.html` | The built game: everything inlined (code, images, fonts). |
| `src/engine.js` | Rules, travel, combat, quests and the save model. |
| `src/generation.js` | Galaxy and opponent generation. |
| `src/encounters.js`, `src/campaigns.js`, `src/yard.js`, `src/finishing.js` | Encounters, quest campaigns, shipyard, endings. |
| `src/data.js`, `src/data.json`, `src/presentation-data.js` | Game constants, names and strings. |
| `src/ui.js`, `src/style.css`, `src/page.html` | The player interface and page template. |
| `assets/` | Original artwork (PNG masters, WebP copies) and Roboto fonts. |
| `android/` | Android WebView wrapper (Gradle project, package `io.github.lunchwine.spacetraderclassic`). |
| `pwa/` | Web app manifest, service worker and icons for the PWA. |
| `fastlane/` | F-Droid store metadata (descriptions, changelogs, screenshots). |
| `scripts/` | `build.py` (bundle) and `to_webp.cjs` (image conversion). |
| `tests/` | Engine integration tests and browser tests; `tests/fixtures/` holds sample saves. |

## Build

Python 3 only. After changing anything in `src/` or `assets/`:

```
python3 scripts/build.py
```

This rewrites `index.html`. If you change a PNG in `assets/`, run `node scripts/to_webp.cjs` first; the build
embeds the WebP copy when it is smaller than the PNG.

`node scripts/render_icons.cjs` regenerates the launcher, PWA and fastlane icon PNGs from the SVG masters in `art/`.

### Android

Release toolchain (the same one F-Droid's recipe uses; keep them in sync):

| Component | Version |
| --- | --- |
| JDK | OpenJDK 17 |
| Gradle | 8.9 (via `android/gradlew`) |
| Android Gradle Plugin | 8.7.3 |
| Android SDK | platform 35, build-tools 35.0.0 |
| Python | 3 (`scripts/build.py` bundles `index.html`; standard library only) |

```
cd android && ./gradlew assembleRelease
```

Gradle runs `scripts/build.py` itself. The release build is minified with R8 (`proguard-android-optimize.txt` plus
`android/app/proguard-rules.pro`, which keeps the `@JavascriptInterface` save-export bridge) and comes out **unsigned** at
`android/app/build/outputs/apk/release/app-release-unsigned.apk`; that is also what F-Droid builds.
`./gradlew assembleDebug` makes a debug-signed APK that can be sideloaded. `android/dev-env.sh` is an optional local helper that sets the
environment.

### Releasing

1. Bump `version` in package.json (and package-lock.json) and `versionName`/`versionCode` in `android/app/build.gradle` together (`build.py` enforces it;
   versionCode = major*10000 + minor*100 + patch). Run `python3 scripts/build.py`, add
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, commit, and tag `vX.Y.Z`. Never move an existing tag.
2. From a clean checkout of that commit, run `./gradlew clean assembleRelease` (twice, if you want to compare hashes).
3. Sign with the developer key: `android/sign-release.sh`. The key lives outside the repository (default
   `~/.android-keys/space-trader-classic.jks`; override with `STC_KEYSTORE`) and the script prompts for its password without echoing it.
   The key can be created once with the `keytool` command in the script's header. Never commit a keystore or password.
4. Upload `space-trader-classic-<version>.apk` to the GitHub Release for the tag. F-Droid's recipe points at it with
   `Binaries:` and `AllowedAPKSigningKeys:` (the signing certificate's SHA-256), so F-Droid can verify its own build against it and publish with this signature.

Reproducibility has been checked only between local builds; the real test is that F-Droid's rebuild matches the published APK.

## Test

Node.js 18 or newer:

```
npm install
npx playwright install chromium
npm test
```

`npm test` runs every `tests/*.cjs` file. The `*-integration.cjs` tests exercise the engine directly; the
`*-browser.cjs` tests drive the built `index.html` in headless Chromium. Output (summaries, screenshots) goes to
`tests/out/`.

## Saves

Saves use `localStorage` keys `space-trader-port-experiment-v1` (game 1) and `space-trader-port-experiment-v1-game2`
(game 2), save format version 2. Keep these stable so existing saves continue to load.

## Credits and license

Original Palm OS game by **Pieter Spronck**. Android version and artwork by **Russell Wolf**, copyright
2014–2016 (https://github.com/inferno986return/Brucelet-Space-Trader-archive, version 1.3.5).
The game artwork in `assets/` comes from that GPL-3.0-or-later Android version (pictures based on originals © 2000 by
Alexander Lawrence). The launcher icon in `art/` is new to this port.
This port is licensed **GPL-3.0-or-later**; see [LICENSE](LICENSE). Roboto fonts are under the Apache License 2.0;
see `assets/fonts/LICENSE.txt` and `assets/fonts/NOTICE.txt`.
