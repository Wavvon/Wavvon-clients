import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P20 — camera video: full-mesh WebRTC over the main WS. Two clients join
// voice in the same channel and enable their cameras; each should see the
// OTHER's video tile once the peer track arrives. Fake camera/mic (see
// playwright.config); WebRTC connects over localhost host candidates.
//
// Note: the responsive MobileShell renders the header twice, so tiles are
// duplicated in the DOM — assert by unique label with .first() rather than
// by count.

async function joinVoiceAndEnableCamera(page: Page) {
  await page.getByRole("button", { name: "Join Voice" }).click();
  const cam = page.getByRole("button", { name: "Turn camera on" });
  await expect(cam).toBeVisible({ timeout: 15000 });
  await cam.click();
  // Local preview tile ("You") shows immediately.
  await expect(page.locator(".video-tile").filter({ hasText: "You" }).first()).toBeVisible({ timeout: 10000 });
}

test("two members see each other's camera over WebRTC", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("cam");
  await createChannel(page, channel);
  await channelButton(page, channel).click();
  await joinVoiceAndEnableCamera(page);

  const memberName = uniqueName("CamMate");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, channel).click();
    await joinVoiceAndEnableCamera(member);

    // Each side receives the other's remote video track → a tile that is NOT
    // the local "You" tile appears (the peer's label may be a name or a
    // pubkey prefix depending on the roster, so match by "not You").
    await expect(page.locator(".video-tile").filter({ hasNotText: "You" }).first())
      .toBeVisible({ timeout: 30000 });
    await expect(member.locator(".video-tile").filter({ hasNotText: "You" }).first())
      .toBeVisible({ timeout: 30000 });

    // Owner turns camera off → the member's remote tile for the owner goes away
    // (the member keeps only their own "You" tile).
    await page.getByRole("button", { name: "Turn camera off" }).click();
    await expect(member.locator(".video-tile").filter({ hasNotText: "You" }).first())
      .toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
