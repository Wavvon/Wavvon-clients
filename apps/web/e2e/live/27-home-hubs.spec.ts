import { test, expect } from "@playwright/test";
import { expectInHub, HUB_URL } from "./helpers/live";

// P27 — home-hub designation write. The owner publishes a master-signed
// HomeHubList to the hub and it round-trips back on reload (proving the signed
// envelope was accepted and stored). Previously web could only read it.

async function openHomeHubs(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Manage accounts", exact: true }).click();
  // Not exact: the section label gains an account-label suffix ("Home hubs
  // — <label>") now that naming an account is mandatory (identity_setup.label).
  const section = page
    .locator(".settings-section", { has: page.getByText("Home hubs") })
    .first();
  await expect(section).toBeVisible({ timeout: 10000 });
  return section;
}

test("publish a home-hub list and read it back", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  let section = await openHomeHubs(page);

  // Signing in publishes this hub as the first home hub on its own, so there
  // is no first write left to make and no "Add this hub" button to click.
  // The round-trip is proven by emptying the published list and putting it
  // back: every assertion below reads what the hub serves, since the section
  // loads from getHomeHubDesignation rather than from local state.
  await expect(section.getByText(HUB_URL, { exact: false }).first()).toBeVisible({ timeout: 10000 });
  await section.getByRole("button", { name: "Remove" }).first().click();
  await section.getByRole("button", { name: "Publish home hubs" }).click();
  await expect(section.getByText("Published ✓")).toBeVisible({ timeout: 10000 });

  // An emptied list stays empty — nothing is added back on the next load.
  await page.reload();
  await expectInHub(page);
  section = await openHomeHubs(page);
  await expect(section.getByText(HUB_URL, { exact: false })).toHaveCount(0);

  // Put it back, so the DM specs later in the file still have a home hub.
  await section.getByRole("textbox", { name: "Home hub URL" }).fill(HUB_URL);
  await section.getByRole("button", { name: "Add", exact: true }).click();
  await section.getByRole("button", { name: "Publish home hubs" }).click();
  await expect(section.getByText("Published ✓")).toBeVisible({ timeout: 10000 });

  // Reload: the hub must serve it again, marked preferred (★), which only
  // happens if the signed write stuck.
  await page.reload();
  await expectInHub(page);
  section = await openHomeHubs(page);
  await expect(section.getByText(HUB_URL, { exact: false }).first()).toBeVisible({ timeout: 10000 });
  await expect(section.getByText("★", { exact: false }).first()).toBeVisible();
});
