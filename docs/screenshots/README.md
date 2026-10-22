# Interface previews

These PNGs capture the real `app/index.html`, CSS and UI behavior in Chromium
at the app's 1920 × 1080 TV layout. The camera API and stream transport are
replaced in the browser by documentation-only mocks. The original vector
illustrations stand in for video; **no live camera, private property image,
real account, email, password, API key or TV connection is involved**.

- `all-cameras.png`: four-camera wall with Front porch selected for sound.
- `two-cameras.png`: two-camera wall.
- `sound-selection.png`: per-camera sound picker with Off.
- `sign-in.png`: empty sign-in form.

The green preview banner and demo-feed labels are documentation overlays, not
live-view status messages. These images illustrate the interface, not playback
performance or compatibility on additional TV models.

## Regenerate

The optional screenshot tool uses Playwright; it is not a runtime dependency.
From the repository root:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/screenshots.cjs
```

It serves only app assets on loopback, blocks browser requests to other origins,
and closes its browser/server when done. To use an existing Chromium binary,
set `PLAYWRIGHT_EXECUTABLE_PATH`. The script uses local mock session values only.

Review each regenerated image before publication and update its pinned SHA-256
in `scripts/check_public.py`. That guard accepts only the four reviewed preview
images and the app icon; arbitrary binary files remain rejected. The screenshot
tool and these documentation assets are excluded from the TV widget.
