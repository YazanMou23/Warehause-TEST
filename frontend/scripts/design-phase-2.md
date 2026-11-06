# Design phase 2 regression

Build the frontend first. Uses the same local-only setup and Playwright prerequisite as `responsive-phase-1.md`.

```sh
cd frontend
npm run build
NODE_PATH=/path/to/playwright/node_modules node scripts/design-phase-2.cjs
```

Optional `CHROME_PATH` and `DESIGN_OUTPUT` variables choose Chrome and the evidence directory.

The runner intercepts external API requests, supplies synthetic fixtures and blocks writes. It checks 320, 390, 820 and 1440px with a mixed document batch (completed, processing, waiting, failed), upload/scanner/camera-error tabs, worker dashboard and hours-entry modal. It asserts one visible hours-entry action on the dashboard and opens it without saving.

It captures screenshots and samples leaf text contrast against composited CSS backgrounds, requiring 4.5:1. This sampling is not a full accessibility certification: it excludes disabled controls, does not assess imagery, gradients, every hover state or all application routes, and cannot validate assistive technology semantics. Camera/device access and successful upload/save/pause/retry actions are not exercised against live services.

The global accent palette is navy and muted gold. Green/red remain semantic status colors. Phase 3 language and RTL work is separate.
