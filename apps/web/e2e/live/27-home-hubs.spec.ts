import { test, expect } from "@playwright/test";
import { expectInHub, HUB_URL } from "./helpers/live";

// P27 — home-hub designation write. The owner publishes a master-signed
// HomeHubList to the hub and it round-trips back on reload (proving the signed
// envelope was accepted and stored). Previously web could only read it.

async function openHomeHubs(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Manage accounts", exact: true }).click();
  const section = page
    .locator(".settings-section", { has: page.getByText("Home hubs", { exact: true }) })
    .first();
  await expect(section).toBeVisible({ timeout: 10000 });
  return section;
}

test("publish a home-hub list and read it back", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  let section = await openHomeHubs(page);

  // Add the current hub and publish.
  await section.getByRole("button", { name: "Add this hub" }).click();
  await expect(section.getByText(HUB_URL, { exact: false }).first()).toBeVisible();
  await section.getByRole("button", { name: "Publish home hubs" }).click();
  await expect(section.getByText("Published ✓")).toBeVisible({ timeout: 10000 });

  // Reload: the section re-fetches the designation from the hub. The hub must
  // appear, marked preferred (★), which only happens if the signed write stuck.
  await page.reload();
  await expectInHub(page);
  section = await openHomeHubs(page);
  await expect(section.getByText(HUB_URL, { exact: false }).first()).toBeVisible({ timeout: 10000 });
  await expect(section.getByText("★", { exact: false }).first()).toBeVisible();
});
