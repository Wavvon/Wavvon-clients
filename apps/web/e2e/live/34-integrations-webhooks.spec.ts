import { test, expect } from "@playwright/test";
import { createChannel, expectInHub, uniqueName } from "./helpers/live";

// P34 — the Integrations tab (incoming webhooks). Listing used GET
// /admin/webhooks and regenerate used PATCH /admin/webhooks/{id}, but the
// server only defined POST/DELETE, so opening the tab 405'd ("Method Not
// Allowed"). The server now serves list + regenerate.

async function openIntegrations(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Incoming Webhooks" })).toBeVisible({ timeout: 10000 });
}

test("integrations tab loads and a webhook can be created, listed, regenerated", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  // A channel to attach the webhook to.
  const channel = uniqueName("wh");
  await createChannel(page, channel);

  await openIntegrations(page);
  // The list load no longer 405s.
  await expect(page.getByText(/Method Not Allowed|HubApiError/)).toHaveCount(0);

  // Create a webhook.
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Incoming Webhooks" }) }).first();
  await section.locator("select").selectOption({ label: `#${channel}` });
  await section.getByPlaceholder("My Integration").fill(uniqueName("Hook"));
  await section.getByRole("button", { name: "Create webhook" }).click();

  // The one-time URL is revealed, and the webhook now appears in the list
  // (proving GET /admin/webhooks works).
  await expect(page.getByText(/won't be shown again/)).toBeVisible({ timeout: 10000 });
  const regenBtn = section.getByRole("button", { name: "Regenerate" }).first();
  await expect(regenBtn).toBeVisible({ timeout: 10000 });

  // Regenerate returns a fresh URL (previously PATCH 405'd).
  await regenBtn.click();
  await expect(page.getByText(/New webhook URL/)).toBeVisible({ timeout: 10000 });
});
