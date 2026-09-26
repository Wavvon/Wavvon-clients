---
name: run-web
description: Launch and drive the Wavvon web client (apps/web) in headless Chromium — dev server, Playwright driver, virtual-authenticator passkeys. Use when asked to run, screenshot, or smoke-test the web app.
---

# Run the Wavvon web client

You need a hub to talk to: run one yourself (the `run-hub` skill in the
[Wavvon-server](https://github.com/Wavvon/Wavvon-server) repo) or point at any
hub you have an invite to. For voice specifically, use the **`voice-e2e`** skill
— it needs two clients and extra browser flags.

## Dev server

From `clients/apps/web`:

```powershell
npm run dev   # run in background
```

Vite serves on **http://localhost:1421/** (not the 5173 default — Tauri-style
port). Poll the port, don't sleep:

```bash
timeout 45 bash -c 'until curl -sf http://localhost:1421 >/dev/null; do sleep 1; done'
```

Stop it by killing the node process whose command line matches `vite`.

## Drive with Playwright

No separate install needed — Playwright is already in the pnpm store. From a
Node script inside the repo, `require("playwright")` resolves if you run it from
a directory that has it as a dependency; otherwise resolve it out of the pnpm
store explicitly:

```bash
ls node_modules/.pnpm | grep playwright   # find the versioned directory
```

```js
const { chromium } = require(
  "<repo>/node_modules/.pnpm/playwright@<version>/node_modules/playwright"
);
```

Chromium binaries live in Playwright's own cache (`%LOCALAPPDATA%\ms-playwright`
on Windows, `~/.cache/ms-playwright` elsewhere). If they're missing:
`npx playwright install chromium`.

Use `launchPersistentContext(profileDir, { headless: true, acceptDownloads: true })`
— the app's identity/state lives in IndexedDB + localStorage per origin, so a
persistent profile keeps accounts across driving rounds (needed because
account switching calls `window.location.reload()`). Use a **fresh profile
dir** to start at the identity-setup screen.

## Gotchas (all hit in practice)

- **UI language follows system locale.** Catalogs ship for en/it/es/de, and
  any not-yet-translated string falls back to English — so on a non-English
  machine the page is a *mix*. Every label quoted below is the English one.
  Don't trust them blind: dump `document.body.innerText` and the button texts
  first, then act. For a deterministic run, pin the language instead of
  fighting it — `apps/web/src/main.tsx` prefers localStorage
  `wavvon_language` over `navigator.language`:

```js
await ctx.addInitScript(() => localStorage.setItem("wavvon_language", "en"));
```
- **Settings** opens via the `⚙` button; the Account tab button is
  `button:has-text("Account")`.
- **Identity creation persists at the phrase step** — closing the browser
  after clicking "Create new identity" still leaves the account saved.
- **Backup export** is a real browser download: `acceptDownloads: true` +
  `page.waitForEvent("download")`, confirm button is "Save backup file".
- **confirm()/alert() dialogs** are used (import switch prompt, etc.) —
  register `page.on("dialog", d => d.accept())` before acting.
- **Passkey flows work headless** via a CDP virtual authenticator with PRF:

```js
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
  protocol: "ctap2", transport: "internal",
  hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
  hasPrf: true, automaticPresenceSimulation: true,
}});
```

  The virtual authenticator dies with the browser session — test
  create-then-restore in ONE session (wipe app storage in between to
  simulate a new device).
- **Tall modals clip below the 900px viewport** (ChannelSettingsModal with
  its icon grid + tags section): Playwright's physical click on a
  below-the-fold footer button can silently hit nothing — the click
  "succeeds" but no handler fires. Symptom: Save does nothing, zero network
  requests. Fix: `page.evaluate(() => btn.click())` on the element, or a
  taller viewport.
- **Read identity state from IndexedDB**, not the screen: db `wavvon`,
  object store `identity`, row `id` = account pubkey hex. The active account
  pointer is localStorage `wavvon:active_account_id`; per-account keys are
  `wavvon:acct:<pubkey>:<key>`.
- **Onboarding step order** (English labels): "Create new identity" → phrase
  screen ("I saved my phrase — Continue") → a **profile setup screen**
  (nickname + avatar, "Skip for now") which comes BEFORE the main app — don't
  blind-fill its input thinking it's add-hub → main app → "Join hub" opens a
  "Looking up hub…" input; fill the URL and confirm.
- **Fresh hub**: `invite_only=true` out of the box, so a plain join is
  refused. The hub logs a one-time `First-boot owner invite:` link on startup
  when it has no owner — join through that and you're owner (and get the
  channel-template wizard). See the `run-hub` skill in the Wavvon-server repo.
- **Message composer is an `<input>`**, not a textarea:
  `input[placeholder*='essag' i]` — the substring dodges the
  message/messaggio locale split.
- **Settings "Close" trap**: the sidebar "Close" button closes the whole
  settings page — don't use it to dismiss an inner modal. Inner edits (e.g.
  the profile banner modal) update the draft on change; "Save changes" is
  clickable with the modal still open.
- **Admin Roles**: the create form only takes name/priority/permissions
  (`input[placeholder="Role name"]`); color/icon/category are edited inline
  on the role row afterwards — `button[title="Role color"]` opens the swatch
  picker, swatches carry their hex as `title` (e.g. `button[title="#e74c3c"]`).
- **Members → Manage roles checkboxes**: Playwright's `.check()` reports
  "did not change its state" because the controlled checkbox re-renders
  async — the assignment DID land; use `.click()` and verify via API/DB
  instead of trusting `.check()`.

## Representative smoke loop

nav → wait ~2.5s (first Vite paint is slow) → screenshot → create identity
("Create new identity" → "I saved my phrase — Continue") → `⚙` → Account →
assert the switcher lists the account. Collect console errors throughout
(`page.on("console")` type === "error" and `page.on("pageerror")`) and check
they're empty before declaring success.
