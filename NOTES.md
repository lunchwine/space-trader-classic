# Working notes

- **Stay faithful.** The goal is the original 1.3.5 game's look, wording, menus, dialogs and flow, not
  improvements. The one accepted browser addition is **Export Save / Import Save** in the Game menu.
- Features that are not in the original are disabled behind `EXTRAS` in `src/ui.js`; options a browser cannot
  support are hidden via `PWA_CANNOT` in the same file.
- **Save compatibility.** Do not change the `localStorage` keys or the save format (version 2) without a
  migration. `E.deserialize` rejects malformed saves; tests rely on that.
- Keep the GPL license, the upstream credits and the font notices.
- `index.html` is generated: edit `src/` and `assets/`, then run `python3 scripts/build.py`.
- `tests/browser-helper.cjs` is the shared Playwright setup; browser tests use a 360x568 viewport by default.
- Use a current Chromium for browser tests; old embedded browsers (e.g. Chrome 83) are too old for the page.
- **Deliberate deviation: Back button.** New games start with "Prev. screen with back button" (`recallScreens`) turned on, so Back steps
  through earlier screens instead of leaving the app (the original defaults it off). Existing saves keep their own setting.
- **Android wrapper** lives in `android/` (offline WebView, no permissions, no dependencies) and bundles the built `index.html`. Build with
  `. android/dev-env.sh && gradle -p android assembleDebug` after `python3 scripts/build.py`. Package id is a placeholder.
