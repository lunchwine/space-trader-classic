# Space Trader Classic

A browser port of the Android game **Space Trader 1.3.5**: a complete, offline, single-file game that follows
the original's galaxy generation, rules, screens, menus, dialogs and wording.

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
| `scripts/` | `build.py` (bundle) and `to_webp.cjs` (image conversion). |
| `tests/` | Engine integration tests and browser tests; `tests/fixtures/` holds sample saves. |

## Build

Python 3 only. After changing anything in `src/` or `assets/`:

```
python3 scripts/build.py
```

This rewrites `index.html`. If you change a PNG in `assets/`, run `node scripts/to_webp.cjs` first; the build
embeds the WebP copy when it is smaller than the PNG.

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
This port is licensed **GPL-3.0-or-later**; see [LICENSE](LICENSE). Roboto fonts are under the Apache License 2.0;
see `assets/fonts/LICENSE.txt` and `assets/fonts/NOTICE.txt`.
