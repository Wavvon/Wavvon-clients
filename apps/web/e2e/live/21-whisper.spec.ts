import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P21 — whisper (targeted voice). Two clients join voice; the owner whispers
// to the member. Verifies the control plane end-to-end: the target receives
// voice_whisper_started and shows the whispering indicator on their
// participant row. (Audio isolation is enforced server-side in voice_ws.rs;
// not asserted here.)

// Whisper controls live in the voice-session footer, opened via the shared
// WhisperPanel (packages/ui/src/components/voice/WhisperPanel.tsx) — a
// channel row is joined by double-click (see the "Double-click to join
// voice" row tooltip in SortableItems.tsx), not a header button.
async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
  await expect(page.getByTitle("Whisper")).toBeVisible({ timeout: 15000 });
}

test("owner whispers to a member; the member sees the indicator", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("whisper");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("WhisperMate"));
  try {
    await joinVoice(member, channel);

    // Owner opens the whisper panel, selects the one participant (Users tab
    // is the default), and starts whispering.
    await page.getByTitle("Whisper").click();
    const panel = page.locator(".whisper-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await panel.locator('input[type="checkbox"]').first().check();
    await panel.getByRole("button", { name: /Whisper to \d+ target/ }).click();
    await expect(page.locator(".whisper-active-banner")).toBeVisible();

    // The member receives voice_whisper_started → sees the badge on the
    // owner's participant row.
    await expect(member.locator(".participant-whisper-badge").first()).toBeVisible({ timeout: 15000 });

    // Owner stops → the member's indicator clears.
    await page.locator(".whisper-active-banner").getByRole("button", { name: "Stop" }).click();
    await expect(member.locator(".participant-whisper-badge")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
