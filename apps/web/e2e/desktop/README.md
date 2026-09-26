# Web ↔ desktop e2e

These specs drive **two different clients at once**: the web client in a
Playwright browser and the real desktop app in its own window.

They live here rather than under `apps/desktop/` because half of each test is
the web client, and this is where Playwright and the live-hub helpers already
are. They are a separate Playwright project (`desktop`), never part of
`test:e2e` or `test:e2e:live`, and never run in CI — they build a Tauri binary
and open a window.

## Why this harness exists

A DM envelope and a subkey cert are pinned by cross-language test vectors:
`packages/core` in TypeScript and `src-tauri/src/identity.rs` in Rust assert the
same bytes. A vector proves the two agree about a value they both already hold.
It cannot prove that what one client *sent* is what the other can *read* —
that path runs through the ratchet, the hub outbox, and each client's own key
handling.

Both of those are also the kind of thing that fails **quietly**. A paired
device whose master derives differently than the cert it was handed names does
not error; it just never decrypts anything. That is why the July 2026 DM bugs
passed every unit suite and were caught only by driving the real apps.

## How it works

WebView2 is Chromium, so the app speaks CDP when it is started with
`--remote-debugging-port`. `helpers/desktopApp.ts` sets
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, spawns `npm run dev` in
`apps/desktop`, waits for the port, and hands back the app's own page through
`chromium.connectOverCDP`.

It also sets `WAVVON_DESKTOP_HOME` to a throwaway directory. Without it the
harness drives the developer's real install: their accounts, their DM ratchet
state, their home hub list. `accounts.rs` reads that variable for this reason
and for no other.

## Running them

You need the same live hub the `live` project uses — see
[../live/README.md](../live/README.md) for the launch recipe — and a desktop
toolchain that can build the Tauri shell.

```powershell
$env:WAVVON_E2E_HUB_URL='http://localhost:3010'
npm run test:e2e:desktop
```

The first run compiles the Rust shell, so the CDP wait is five minutes by
default. A build failure surfaces as the child's output rather than as a
timeout.

`WAVVON_DESKTOP_CDP_PORT` moves the debug port (default 9333) if something else
is already on it.

## What the first run found

The harness paid for itself before it was green.

- **A DM sent from desktop never reaches the hub.** `01-dm-web-desktop` passes
  the web→desktop leg — the Rust side decrypts what TypeScript encrypted — and
  fails the return one. The composer takes the text, Enter clears it, and
  `dm_messages` gains no row. No error, no encryption warning, nothing in the
  UI. The spec is left failing on purpose: it is the reproduction.
- **Web and desktop cannot pair with each other.** Web's pairing code is
  `base64({hub, token})`; desktop's claim expects a full signed `PairingOffer`
  JSON (`parse_pairing_offer`). Neither client can read the other's code in
  either direction, so there is no web↔desktop pairing spec to write yet.
- **Desktop has no way to set a display name while onboarding.** The nickname
  step (`ProfileSetupStep`) and the post-join prompt (`showDisplayNamePrompt`)
  are both web-only, so a fresh desktop identity joins with an empty
  `display_name` and shows in the member list as `public_key.slice(0, 16)` —
  which is why the spec finds its own member by roster difference rather than
  by name.

## Known limits

- **One app per spec file.** Each file launches its own instance in
  `beforeAll`; two files cannot share the debug port, which is why the project
  runs with `--workers=1`.
- **The window is real.** It takes focus when it opens, and a screen locker or
  a machine going to sleep mid-run will fail the spec.
