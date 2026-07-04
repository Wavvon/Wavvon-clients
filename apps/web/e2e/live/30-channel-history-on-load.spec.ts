import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, uniqueName } from "./helpers/live";

// P30 — the auto-selected channel loads its history without a manual click.
// loadHubData() auto-selects the first channel but previously never fetched its
// messages (only handleSelectChannel did), so the pane stayed empty after a hub
// switch / fresh load until the user clicked a channel. Same code path as a hub
// switch; exercised here via reload.

test("the auto-selected channel shows its history after reload", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  // Use whatever channel the app auto-selected; if none (empty hub), make one
  // and select it. Either way it becomes the first channel the app re-selects
  // on the next load.
  let composer = page.getByPlaceholder(/^Message #/).first();
  if (!(await composer.isVisible().catch(() => false))) {
    const name = uniqueName("hist");
    await createChannel(page, name);
    await channelButton(page, name).click();
    composer = page.getByPlaceholder(/^Message #/).first();
  }
  await expect(composer).toBeVisible({ timeout: 10000 });

  const body = `history-on-load ${Date.now()}`;
  await composer.fill(body);
  await composer.press("Enter");
  await expect(page.getByText(body).first()).toBeVisible({ timeout: 10000 });

  // Reload: the app auto-selects the same channel and must now load its
  // history without any manual click.
  await page.reload();
  await expectInHub(page);
  await expect(page.getByText(body).first()).toBeVisible({ timeout: 15000 });
});
