---
name: voice-e2e
description: Drive two web clients into a voice channel against a local hub and prove audio actually flowed end to end — Chromium flags, hub requirements, and the instrumentation that distinguishes "connected" from "audible". Use when testing, debugging or verifying voice, WebTransport, soundboard or the audio pipeline.
---

# Two-client voice, end to end

Voice is the feature where "it connected" and "it worked" are different
statements, and where a unit suite tells you nothing. This recipe caught five
bugs no test suite saw. Start from the `run-web` skill for the dev server and the
Playwright setup; this file covers what is different about voice.

## Chromium flags — all three are required

```js
args: [
  "--use-fake-device-for-media-capture",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
]
```

The third one is the trap. Without it the `AudioContext` stays **suspended** in
headless, `onaudioprocess` never fires, and you get **zero sends and zero
errors** — a session that looks perfectly healthy and transmits nothing. If you
are debugging "connects but silent", check this flag before reading any code.

The first two give every context a synthetic microphone and auto-accept the
permission prompt, so no click is needed to grant mic access.

## Hub requirements

Voice needs a hub with a public URL: `WAVVON_PUBLIC_URL=http://localhost:3000`.
Without it `/info.voice_wt_url` is **null** and clients cannot connect voice at
all — everything else about the hub works fine, which is what makes this
confusing. See the `run-hub` skill in the Wavvon-server repo.

Sanity check before driving anything:

```bash
curl -s http://localhost:3000/info | grep -o '"voice_wt_url":[^,]*'
```

The relay is **UDP 3001** (WebTransport/QUIC). If it isn't reachable, voice
fails and nothing else does.

## Two clients

Use **two separate persistent contexts** with different profile directories —
two pages in one context share storage, so the second identity overwrites the
first. Each context needs its own set of the flags above.

Both accounts must be members of the same hub and see the same voice channel.
**Joining voice in the web UI is a double-click on the channel** in the sidebar,
not a single click.

## Proof of audio

The point of the exercise. Inject via `page.addInitScript` **before** navigating,
in both contexts:

```js
// Every createBufferSource is a datagram that survived
// receive -> decrypt -> Opus-decode. play > 0 on the far side proves the
// whole path, not just a connected session.
const origCBS = AudioContext.prototype.createBufferSource;
window.__play = 0;
AudioContext.prototype.createBufferSource = function (...a) {
  window.__play++;
  return origCBS.apply(this, a);
};
```

Then read `window.__play` on each page after a few seconds of talking. Zero on
the receiver with a healthy session means the failure is downstream of transport
— decrypt or decode — not in connection setup.

Two more wrappers worth having in place from the start:

- **`window.WebTransport`** — subclass it and log the session URL, `ready` and `closed`. This separates "never opened a session" from "opened and then dropped", which look identical from the UI.
- **`WebSocket.prototype.send`** and the `message` listener — tally message types. Voice key exchange rides the WebSocket, so this is how you see whether `voice_key_offer` / `voice_key_received` actually flowed. A silent key exchange is a silent voice channel.

## Gotchas

- **First-run wizards interrupt scripted flows.** Identity creation is followed by a profile setup screen; a fresh hub shows its first user a channel-template wizard. Dismiss them (skip button / template card) before expecting the channel sidebar. See `run-web` for the exact step order.
- **The UI language follows system locale.** Don't hardcode selectors on translated strings — dump `document.body.innerText` and the button texts first, then act.
- **Give it time.** Voice needs a few seconds of real wall-clock to produce a meaningful counter. Sample twice and compare rather than reading once immediately after joining.
- **Don't run long test suites in a detached background shell** while driving browsers — a multi-minute cargo suite competing for the machine has been killed mid-run more than once. Run big suites in bounded chunks, separately.
- Collect `page.on("console")` errors and `page.on("pageerror")` throughout, and check they're empty before declaring success. A voice session with a console full of decode errors is not a pass.

## What to report

`__play` counts per side, whether the WebTransport session opened and stayed
open, which WebSocket message types were seen, and the console error list. "Voice
works" without those numbers is not a verification — say what you measured.
