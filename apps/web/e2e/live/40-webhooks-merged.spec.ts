import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P40 — incoming + outgoing webhooks now live together under one Integrations
// tab (#19), instead of two separate admin tabs.

async function openIntegrations(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Incoming Webhooks" })).toBeVisible({ timeout: 10000 });
}

test("Integrations tab shows both incoming and outgoing webhooks", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openIntegrations(page);
  await expect(page.getByRole("heading", { name: "Incoming Webhooks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outgoing Webhooks" })).toBeVisible();
});

test("there is no separate Outgoing Webhooks admin tab", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  // The tab nav no longer offers a standalone Outgoing Webhooks tab.
  await expect(page.getByRole("button", { name: "Outgoing Webhooks", exact: true })).toHaveCount(0);
});
