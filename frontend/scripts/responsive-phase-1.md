# Responsive phase 1 regression

Build the frontend first. The runner needs Playwright and Chrome; it starts a local production frontend on port 3400 and stops it afterward.

```sh
cd frontend
npm run build
NODE_PATH=/path/to/playwright/node_modules node scripts/responsive-phase-1.cjs
```

Optional environment variables: `CHROME_PATH` and `RESPONSIVE_OUTPUT`.

All API responses are synthetic. Non-GET external requests are blocked. No database or live account is used.

Checks at 320, 390, 820 and 1440 pixels:
- Modal stays on screen; save remains reachable after internal scroll.
- Viewport does not disable zoom.
- Employee selection works and phone cards fit the viewport.
- Weekly day editor opens by keyboard.
- Planning inputs/selects stay in the viewport.
- Captures employee cards, scrolled modal, daily attendance and planning.

Desktop/tablet tables retain horizontal scrolling where needed. This is not an end-to-end test of saving, deletion, messaging, camera access or file export. Language/RTL and palette work are separate phases.
