import { test, expect } from "@playwright/test";
import { createChannel, expectInHub, uniqueName } from "./helpers/live";

// P37 — a long channel name must truncate so its row stays within the sidebar
// and the settings gear remains reachable (previously a long name pushed the
// gear off-screen, so the channel couldn't be managed/deleted from the tree).

test("a long channel name truncates and its settings gear stays reachable", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const longName = uniqueName("this-is-an-extremely-long-channel-name-that-would-overflow");
  await createChannel(page, longName);

  const row = page.locator(".channel-item", { hasText: longName }).first();
  await expect(row).toBeVisible({ timeout: 10000 });

  // The name element is clipped (scrollWidth exceeds its clientWidth).
  const clipped = await row.locator(".channel-name").first().evaluate(
    (el) => el.scrollWidth > el.clientWidth,
  );
  expect(clipped).toBe(true);

  // The gear is still reachable and opens the channel settings dialog.
  await row.hover();
  await row.locator(".channel-settings-btn").first().click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
});
