import { test, expect, type Page } from "@playwright/test";
import { openHubAdminSection } from "../helpers/settings";
import { readFileSync } from "node:fs";
import { channelButton, createChannel, expectInHub, newMemberPage, openSettingRow, settingRow, uniqueName } from "./helpers/live";

// P81 — a soundboard clip plays to the room while its player is muted (#487).
//
// Mute is about the microphone, not the soundboard. The send path used to
// return before mixing anything while muted, so the room heard nothing and
// the player got no sign of it. Same proof as P66: inbound packet loss reads
// "—" until a datagram has been parsed, unsealed and Opus-decoded. Here the
// microphone is shut by self-mute rather than by the VAD gate, and the fake
// capture device would otherwise be heard, so "—" before the clip proves the
// mute holds and a number after proves the clip crossed it.

// A real Ogg Opus file, not the synthetic 4-byte one P7 builds to satisfy the
// hub's container check: this one has to survive `decodeAudioData` in the
// browser, or there is no `activeClip` and nothing to hear.
const CLIP = readFileSync(new URL("../fixtures/tone-440.ogg", import.meta.url));

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

test("a muted player's soundboard clip still reaches the room", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expectInHub(page);

  // Upload the clip through the admin UI, as P7 does.
  const clipName = uniqueName("tone");
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await openHubAdminSection(page, "Soundboard");
  const addRow = await openSettingRow(page, "Add a clip");
  await addRow.getByRole("textbox").first().fill(clipName);
  await addRow.locator('input[type="file"]').setInputFiles({
    name: "tone-440.ogg",
    mimeType: "audio/ogg",
    buffer: CLIP,
  });
  await addRow.getByRole("button", { name: "Upload clip" }).click();
  await expect(settingRow(page, clipName)).toBeVisible({ timeout: 20000 });
  await page.keyboard.press("Escape");

  const channel = uniqueName("clip");
  await createChannel(page, channel, "Voice channel");
  await joinVoice(page, channel);

  const { context, page: listener } = await newMemberPage(browser, uniqueName("Listener"));
  try {
    await joinVoice(listener, channel);

    await listener.locator(".conn-chip").click({ timeout: 15000 });
    await expect(listener.locator(".conn-panel")).toBeVisible();

    // Claim one: muted, the microphone does not cross. The listener mutes too,
    // so nothing reaches the player either.
    await listener.getByRole("button", { name: "Mute microphone", exact: true }).first().click();
    await page.bringToFront();
    await page.getByRole("button", { name: "Mute microphone", exact: true }).first().click();
    await page.waitForTimeout(3000);
    await listener.bringToFront();
    await expect(connValue(listener, "Packet loss (in)")).toHaveText("—");

    // Claim two: still muted, the clip arrives.
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
