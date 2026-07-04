import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, uniqueName } from "./helpers/live";

// P6 — join-to-create temp voice channels on web (regression for hub
// 1fc5aa6). Clicking a spawner ("Voice Lobby") over web's /voice/ws relay
// must spawn a personal temp room and land the user THERE, not in the
// spawner row itself. No audio assertions — fake media, UI state only.

test("clicking a spawner creates and joins a temp room, not the spawner", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const spawner = uniqueName("lobby");
  await createChannel(page, spawner, "Voice Lobby");

  // Click the spawner → voice join → hub spawns a sibling temp room.
  await channelButton(page, spawner).click();

  // A temporary room appears and is the room we actually joined.
  const tempRow = page.locator("li", { has: page.locator(".channel-temp-badge") });
  await expect(tempRow).toBeVisible({ timeout: 20000 });
  await expect(tempRow.locator(".in-voice-here")).toBeVisible();

  // The spawner row itself must NOT be the active voice channel.
  const spawnerRow = page.locator("li", {
    has: page.getByRole("button", { name: new RegExp(`^${spawner}`) }),
  });
  await expect(spawnerRow.locator(".in-voice-here")).toHaveCount(0);

  // The voice session closes when the context tears down at test end; the
  // hub then reaps the now-empty temp room.
});
