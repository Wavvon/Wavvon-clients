import { test, expect } from "@playwright/test";
import { expectInHub, settingRow } from "./helpers/live";

// P40 — incoming + outgoing webhooks now live together under one Integrations
// tab (#19), instead of two separate admin tabs.

async function openIntegrations(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  // The admin nav tab is labeled "Webhooks" (HubAdminPage.tsx), even though
  // the page it opens is titled "Integrations".
  await page.getByRole("button", { name: "Webhooks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible({ timeout: 10000 });
}

test("Integrations tab shows both incoming and outgoing webhooks", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openIntegrations(page);
  // Both are settings rows under the one heading; neither needs opening to
  // say it is there.
  await expect(settingRow(page, "Incoming webhooks")).toBeVisible();
  await expect(settingRow(page, "Outgoing webhooks")).toBeVisible();
});

test("there is no separate Outgoing Webhooks admin tab", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  // The tab nav no longer offers a standalone Outgoing Webhooks tab.
  await expect(
    page.locator(".settings-nav").getByRole("button", { name: "Outgoing webhooks", exact: true }),
  ).toHaveCount(0);
});
