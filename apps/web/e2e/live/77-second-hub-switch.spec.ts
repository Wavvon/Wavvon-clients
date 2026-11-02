import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createChannel, dismissHubSetupWizard, expectInHub, HUB_URL, uniqueName } from "./helpers/live";

// P77 — joining a second hub must not leave the first hub's channel or
// messages on screen (issue #230).
//
// The second hub is a real one the harness starts on WAVVON_E2E_SECOND_HUB_URL
// and seeds with the same owner key, so the join needs no invite. Skipped
// without it.

const SECOND = process.env.WAVVON_E2E_SECOND_HUB_URL;

function railIcon(page: Page, url: string) {
  return page.locator(`.hub-icon[title*="${new URL(url).host}"]`).first();
}

// The hub list is synced through the home hub, so a second hub joined by an
// earlier run is restored into this browser too and must be dropped first.
async function removeFromRail(page: Page, url: string) {
  const icon = railIcon(page, url);
  if (!(await icon.isVisible().catch(() => false))) return;
  await icon.click({ button: "right" });
  await page.getByText("Remove from this device").first().click();
  await page.locator(".modal-actions .btn-primary.danger").click();
  await expect(icon).toBeHidden({ timeout: 10000 });
}

test("a just-joined hub does not show the previous hub's messages", async ({ page }) => {
  test.skip(!SECOND, "needs a second hub: set WAVVON_E2E_SECOND_HUB_URL");
  test.setTimeout(90000);

  await page.goto("/");
  await expectInHub(page);
  await removeFromRail(page, SECOND!);
  await expect(railIcon(page, HUB_URL)).toHaveAttribute("aria-selected", "true");

  try {
    const channel = uniqueName("alpha").toLowerCase();
    await createChannel(page, channel);
    await page.locator(".channel-item", { hasText: channel }).first().click();
    const message = uniqueName("first-hub-message");
    const composer = page.getByPlaceholder(`Message #${channel}`);
    await composer.fill(message);
    await composer.press("Enter");
    await expect(page.getByText(message)).toBeVisible({ timeout: 10000 });

    await page.getByTitle("Join a hub").first().click();
    await page.getByRole("dialog").getByRole("textbox").fill(SECOND!);
    await page.getByRole("dialog").getByRole("textbox").press("Enter");

    const secondIcon = railIcon(page, SECOND!);
    await expect(secondIcon).toHaveAttribute("aria-selected", "true", { timeout: 20000 });
    await dismissHubSetupWizard(page, 3000);

    await expect(page.getByText(message)).toHaveCount(0);
    await expect(page.locator(".channel-item", { hasText: channel })).toHaveCount(0);

    await page.reload();
    await expectInHub(page);
    await expect(railIcon(page, SECOND!)).toBeVisible({ timeout: 15000 });
    await dismissHubSetupWizard(page, 3000);
  } finally {
    await removeFromRail(page, SECOND!);
  }
});
