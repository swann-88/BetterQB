# Third-Party Notices

## Webintosh (GPL-3.0)
- Project: [Mengobs/Webintosh](https://github.com/Mengobs/Webintosh)
- License: GPL-3.0
- Copyright: Webintosh contributors

### Adaptation provenance in this project
The renderer visual reset in this round adapts implementation patterns from Webintosh as requested by product direction.

Primary references inspected:
- `assets/styles/manager.css`
- `assets/styles/readme.css`
- `assets/styles/oobe.css`
- `assets/styles/logon.css`
- `assets/styles/font.css`
- `firmware/manager.html`
- `src/js/ui.js`
- `screenshots/settings.png`

Adapted pattern areas in `electron-client`:
- Settings-style left navigation and grouped row treatment (single-surface mode)
- Compact, quiet control language (rounded utility icon controls, restrained button sizing)
- Layered panel/sheet surface composition (soft borders, low-contrast shadows, muted materials)
- Search/header rhythm and spacing hierarchy for settings-like shell layout
- Scroll-area styling and subdued interaction treatments

Project files where these adaptations were integrated:
- `src/renderer/index.html`
- `src/renderer/scripts/modules/render.js`
- `src/renderer/styles/tokens.css`
- `src/renderer/styles/shared-primitives.css`
- `src/renderer/styles/settings-shell.css`
- `src/renderer/styles/sheet-primitives.css`
- `src/renderer/styles/main-shell.css`

Notes:
- No fake-OS shell behavior was imported.
- No backend/lifecycle/data behavior was changed as part of this adaptation.
