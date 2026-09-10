import { test, expect, type Page } from "@playwright/test";
import { HUB_URL, channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P62 — audio actually crosses.
//
// Every voice spec in this suite except P58 and this one asserts on roster
// state the hub pushes over the WebSocket, so all of them pass identically
// whether the transport connected, failed, or was never attempted. P58 closed
// half of that: Chromium does accept the hub's self-signed cert, so the
// handshake is real. It stops at the handshake — it opens a session with a
// token the hub cannot have minted, on purpose.
//
// This is the other half. Two real clients in one voice channel, and the
// assertion is the receiving client's *inbound packet loss* readout: it is
// null — rendered "—" — until `lossBySender` has folded two datagrams from
// one sender, and a datagram only reaches that map after
// `parseDownlinkDatagram`, the sender-id → pubkey lookup, the AEAD open
// against the key that came over the WebSocket, the replay guard, and the
// Opus decode (platform/voice.ts `onDatagram`). A number in that row is
// therefore the whole chain: capture → encode → seal → datagram → the hub's
// header-only fan-out → unseal → decode.
//
// The outbound row is the same claim measured from the other end, by the only
// party that can: the relay counts gaps in a sender's cleartext `ctr`, so the
// row existing at all means the hub received our datagrams.
//
// What is still not proven, and cannot be here: that a speaker made a sound.
// Two clients on a real network remain the only thing that proves audio is
// audible.

// Music turns the silence gate off entirely (platform/speakingDetector.ts
// `effectiveVad`), so the mic transmits continuously instead of waiting for
// Chromium's fake capture device to trip a threshold. Set through the same
// unscoped localStorage key the voice settings tab writes and `useVoice`
// reads at join time — the subject here is the datagram path, not the
// settings UI, which P41 and the audio-profile specs already drive.
const MUSIC_PROFILE = JSON.stringify({
  profile: "music",
  customBitrate: null,
  customApp: "voip",
  customNoiseSuppress: true,
  customVad: false,
  vadThreshold: 0.02,
  customVadThreshold: 0.02,
  customChannels: 1,
  customFrameMs: 20,
  customComplexity: 9,
});

async function transmitContinuously(page: Page) {
  await page.evaluate((cfg) => {
    localStorage.setItem("wavvon.audio_profile", cfg);
  }, MUSIC_PROFILE);
}

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, {
    timeout: 30000,
  });
}

/** The value cell of one row of the connection panel, by its visible key. */
function connValue(page: Page, key: string) {
  return page
    .locator(".conn-panel .conn-row")
    .filter({ hasText: key })
    .locator(".conn-val");
}

test("a datagram is received, unsealed and decoded — not just a roster row", async ({ page, browser }) => {
  const info = await (await page.request.get(`${HUB_URL}/info`)).json();
  // No advertised transport means no datagram can be sent at all, and the
  // roster-only specs would still pass — which is the whole point of this
  // one. Skipping is honest; asserting here would fail for a hub setting.
  test.skip(
    !info.voice_wt_url,
    "hub advertises no voice_wt_url — start it with WAVVON_PUBLIC_URL set",
  );
  test.setTimeout(150000);

  await page.goto("/");
  await expectInHub(page);
  await transmitContinuously(page);

  const channel = uniqueName("audio");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const speakerName = uniqueName("Speaker");
  const { context, page: speaker } = await newMemberPage(browser, speakerName);
  try {
    await transmitContinuously(speaker);
    await joinVoice(speaker, channel);

    // Both sides transmit, so either could be read; the owner is read because
    // it is also the side whose hub session can report outbound loss.
    //
    // The speaker is brought to the front first: a backgrounded tab's
    // ScriptProcessor is throttled by Chromium, and both pages cannot be
    // foreground at once. What accumulates in `lossBySender` stays there, so
    // the owner's readout is still true once focus moves back.
    await speaker.bringToFront();
    await expect(speaker.locator(".voice-status-label").first()).toHaveText(`#${channel}`);
    await page.bringToFront();

    await page.locator(".conn-chip").click();
    await expect(page.locator(".conn-panel")).toBeVisible();

    // The claim. A percentage rather than "—" means frames from the speaker
    // were parsed, unsealed with the key that arrived over the WebSocket, and
    // Opus-decoded. Polled generously: the key offer is a WebSocket round
    // trip and two frames are 40 ms after that.
    await expect(connValue(page, "Packet loss (in)")).toHaveText(/^\d+(\.\d+)? %$/, {
      timeout: 60000,
    });

    // And from the relay's side: the row is absent entirely when the hub
    // reports nothing, so its presence means the hub counted datagrams of
    // ours (it reads `ctr` out of the cleartext header without opening the
    // payload). Both halves of the path, measured independently.
    await expect(connValue(page, "Packet loss (out)")).toHaveText(/^\d+(\.\d+)? %$/, {
      timeout: 60000,
    });
  } finally {
    await context.close();
  }
});
