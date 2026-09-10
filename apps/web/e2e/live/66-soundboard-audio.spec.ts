import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P66 — a soundboard clip reaches the room, and silence does not.
//
// Two claims in one run, and the first is what makes the second mean
// anything. The send path gates on `!speaking && !activeClip`
// (platform/voice.ts): nothing goes out while nobody is talking, and a
// playing clip counts as talking even though `updateSpeaking` runs on the raw
// mic frame on purpose, so a clip never reads as speech. Neither half was
// covered — P7 uploads a clip and says outright that it does not assert
// playback, and the popover specs only place the popup on screen.
//
// The mic is shut out by setting the VAD threshold to 1.0: RMS is at most
// 1.0 and the gate is a strict `energy > threshold`, so Chromium's fake
// capture device can never open it. That leaves the clip as the only thing
// that can, which is what turns "the receiver heard something" into "the
// receiver heard the clip".
//
// The assertion is the same as P62's: inbound packet loss reads "—" until a
// datagram has been parsed, unsealed with a key that arrived over the
// WebSocket, and Opus-decoded.

// A real Ogg Opus file, not the synthetic 4-byte one P7 builds to satisfy the
// hub's container check: this one has to survive `decodeAudioData` in the
// browser, or there is no `activeClip` and nothing to hear.
const CLIP = readFileSync(new URL("../fixtures/tone-440.ogg", import.meta.url));

const GATE_SHUT = JSON.stringify({
  profile: "standard",
  customBitrate: null,
  customApp: "voip",
  customNoiseSuppress: true,
  customVad: true,
  vadThreshold: 1.0,
  customVadThreshold: 1.0,
  customChannels: 1,
  customFrameMs: 20,
  customComplexity: 9,
});

async function shutTheMicGate(page: Page) {
  await page.evaluate((cfg) => {
    localStorage.setItem("wavvon.audio_profile", cfg);
  }, GATE_SHUT);
}

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, {
    timeout: 30000,
  });
}

function connValue(page: Page, key: string) {
  return page
    .locator(".conn-panel .conn-row")
    .filter({ hasText: key })
    .locator(".conn-val");
}

test("a soundboard clip crosses the room that silence never left", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expectInHub(page);

  // Upload the clip through the admin UI, as P7 does.
  const clipName = uniqueName("tone");
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Soundboard", exact: true }).click();
  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "Soundboard" }),
  });
  await section.getByRole("textbox").fill(clipName);
  await section.locator('input[type="file"]').setInputFiles({
    name: "tone-440.ogg",
    mimeType: "audio/ogg",
    buffer: CLIP,
  });
  await page.getByRole("button", { name: "Upload clip" }).click();
  await expect(page.locator("tr", { hasText: clipName })).toBeVisible({ timeout: 20000 });
  await page.keyboard.press("Escape");

  await shutTheMicGate(page);
  const channel = uniqueName("clip");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: listener } = await newMemberPage(browser, uniqueName("Listener"));
  try {
    await shutTheMicGate(listener);
    await joinVoice(listener, channel);

    await listener.locator(".conn-chip").click({ timeout: 15000 });
    await expect(listener.locator(".conn-panel")).toBeVisible();

    // Claim one: with both gates shut, nothing crosses. This is the silence
    // gate doing its job, and it is also what makes the second claim about
    // the clip rather than about the microphone.
    await page.bringToFront();
    await page.waitForTimeout(3000);
    await listener.bringToFront();
    await expect(connValue(listener, "Packet loss (in)")).toHaveText("—");

    // Claim two: the clip opens the gate, and arrives.
    await page.bringToFront();
    await page.getByRole("button", { name: "Soundboard" }).first().click();
    const popup = page.locator(".reaction-picker-popup").first();
    await expect(popup).toBeVisible({ timeout: 10000 });
    await popup.locator(".soundboard-clip-btn", { hasText: clipName }).click();

    // The clip is a second long and the sender keeps playing it out; the
    // listener needs two frames under a key that arrived over the socket.
    await page.waitForTimeout(2000);
    await listener.bringToFront();
    await expect(connValue(listener, "Packet loss (in)")).toHaveText(/^\d+(\.\d+)? %$/, {
      timeout: 60000,
    });
  } finally {
    await context.close();
  }
});
