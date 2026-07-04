import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P21 — whisper (targeted voice). Two clients join voice; the owner whispers
// to the member. Verifies the control plane end-to-end: the target receives
// voice_whisper_started and shows the "whispering to you" indicator. (Audio
// isolation is enforced server-side in voice_ws.rs; not asserted here.)

async function joinVoice(page: Page) {
  await page.getByRole("button", { name: "Join Voice" }).click();
  await expect(page.locator(".whisper-bar").first()).toBeVisible({ timeout: 15000 });
}

test("owner whispers to a member; the member sees the indicator", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("whisper");
  await createChannel(page, channel);
  await channelButton(page, channel).click();
  await joinVoice(page);

  const { context, page: member } = await newMemberPage(browser, uniqueName("WhisperMate"));
  try {
    await channelButton(member, channel).click();
    await joinVoice(member);

    // Owner opens the whisper picker (enabled once the member is in voice),
    // selects the one participant, and starts whispering.
    const whisperToggle = page.locator(".whisper-bar").first().getByRole("button", { name: /Whisper/ });
    await expect(whisperToggle).toBeEnabled({ timeout: 15000 });
    await whisperToggle.click();
    await page.locator(".whisper-bar").first().locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Start whisper" }).click();
    await expect(page.getByText(/Whispering to/).first()).toBeVisible();

    // The member receives voice_whisper_started → sees the indicator.
    await expect(member.getByText(/whispering to you/).first()).toBeVisible({ timeout: 15000 });

    // Owner stops → the member's indicator clears.
    await page.getByRole("button", { name: "Stop whispering" }).click();
    await expect(member.getByText(/whispering to you/).first()).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
